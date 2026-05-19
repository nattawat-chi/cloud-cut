# CloudCut — Database Design

## Entity overview

```
users ─┐
       ├─< workspace_members >── workspaces ──< projects ──< tracks ──< clips ──< clip_effects
       │                                  │                                 │
       │                                  ├──< assets ─< asset_variants     └──< transitions
       │                                  ├──< text_overlays
       │                                  ├──< export_jobs
       │                                  └──< operation_logs (partitioned)
       └─< refresh_tokens
           invitations
```

## Table inventory

| Table | Rows (est. 12 mo) | Notes |
|---|---|---|
| `users` | 50 k | Grows with marketing |
| `workspaces` | 15 k | 3 users / workspace average |
| `workspace_members` | 45 k | Junction |
| `invitations` | 5 k | Most accepted and cold |
| `projects` | 60 k | ~4 / workspace |
| `tracks` | 240 k | 4 / project average |
| `assets` | 2 M | Main bulk table |
| `asset_variants` | 10 M | 5 variants / asset |
| `clips` | 6 M | 25 / project average |
| `clip_effects` | 18 M | 3 / clip average |
| `transitions` | 1 M | Optional, many projects skip |
| `text_overlays` | 600 k | Optional |
| `export_jobs` | 120 k | 2 / project average |
| `operation_logs` | 50 M+ | Hot write path, partitioned |
| `refresh_tokens` | 500 k | Pruned weekly |

---

## Design decisions (§1.4 questions)

### Q1 — Why UUID primary keys instead of BIGSERIAL?

UUIDs (`gen_random_uuid()` via pgcrypto) are generated client-side or at the API
layer before the row is inserted, so the frontend can optimistically reference an
ID before the round-trip completes. They also avoid enumeration attacks (a
sequential ID leaks how many projects exist) and make cross-service or cross-shard
merges trivial. The storage cost is 16 bytes vs 8 bytes per PK — acceptable given
the row sizes in this schema. The one exception is `operation_logs.id` which is
BIGSERIAL because that table is append-only at high throughput and sequential IDs
compress better in the partition B-tree.

### Q2 — Soft delete vs hard delete

We use **hard delete** with `ON DELETE CASCADE` for the project/track/clip
hierarchy and `ON DELETE SET NULL` for user references so orphaned assets survive
the user account deletion. Rationale: soft-delete via `deleted_at` columns bloats
every query with a `WHERE deleted_at IS NULL` filter, makes partial indexes harder
to reason about, and leaks storage indefinitely. Instead, we rely on:

- The Axum API validating permissions before any `DELETE`.
- A "trash bin" concept at the application layer (archive flag on projects) rather
  than a DB-level tombstone.
- `operation_logs` as the authoritative audit trail for compliance — a deleted
  clip's history is preserved in the log even after the row is gone.

### Q3 — JSONB vs normalised columns for clip effects and transitions

`clip_effects` uses **normalised columns** (`type`, `value`, `enabled`, `position`)
because:

1. The set of effect types is bounded and known at schema time (enum).
2. We need to query `WHERE type = 'brightness' AND enabled = true` for the ffmpeg
   filter-graph builder — a JSONB path expression is slower and unindexable without
   a GIN expression index.
3. Individual effect values need `NUMERIC` precision, not JSON's float semantics.

`transitions.params` and `text_overlays.style` **do** use JSONB because their
schemas vary per transition type / style preset, they are never filtered on, and
storing them normalised would require a polymorphic EAV design that is harder to
evolve.

### Q4 — Partitioning strategy for `operation_logs`

`operation_logs` is range-partitioned by `applied_at` in one-month intervals.

- **Why range?** The dominant query pattern is "give me all ops for project X since
  sequence Y" — always bounded by a recent time range. Range partitioning aligns
  the partition pruner with that access pattern.
- **Why monthly?** A busy workspace generates ~500 k rows/month. A 12-month
  retention policy means 12 partitions to prune vs. scanning one 6 M-row table.
- **Maintenance**: a pg_cron job (or the Rust worker) creates next-month's partition
  at the start of each month and drops partitions older than 12 months.
- **Caveat**: the parent table's FK to `projects` is intentionally omitted to avoid
  cross-partition FK scans. Referential integrity is enforced at the application
  layer in the Axum handlers.

### Q5 — Index philosophy

Two rules drove every index in `0002_indexes.sql`:

1. **Every UI list query gets a covering index** — e.g. `idx_clips_track_pos_covering`
   includes `dur_ms`, `name`, `version` so the timeline load never does a heap
   fetch.
2. **Hot write paths get minimal indexes** — `operation_logs` has only three
   indexes because it is the highest-volume append table. Extra indexes on append
   paths cause write amplification.

Partial indexes are preferred over full indexes whenever a large fraction of rows
will never be queried (e.g. accepted invitations, non-queued export jobs,
non-active refresh tokens).

### Q6 — FPS and resolution: project-level only vs per-clip

FPS and resolution live on **projects only**. Individual clips inherit the project
settings. Rationale:

- A timeline export renders to a single output spec; per-clip resolution would
  require constant rescaling in the ffmpeg graph, adding latency and complexity.
- If a user needs to mix resolutions (e.g. vertical phone footage on a 16:9
  timeline), the UX handles it with a clip "fit" mode stored in `clips` (not yet
  in schema — added in Phase 3 as `clip.fit_mode`).
- FPS conversion is handled by ffmpeg at export time using the project FPS as the
  target; source clip FPS is stored in `assets.duration_ms` / frame count meta.

### Q7 — Asset storage layout (S3 key convention)

```
originals/{workspace_id}/{asset_id}/original.{ext}
variants/{asset_id}/proxy.mp4
variants/{asset_id}/thumbnail.jpg
variants/{asset_id}/waveform.json
variants/{asset_id}/hls_360/index.m3u8
variants/{asset_id}/hls_720/index.m3u8
variants/{asset_id}/hls_1080/index.m3u8
exports/{project_id}/{export_job_id}/output.{mp4|webm|mov}
```

- Originals are workspace-scoped to enforce billing quotas per workspace.
- Variants are asset-scoped (not workspace) so the CDN URL is stable regardless of
  which workspace the asset is shared into.
- MinIO bucket policy: `variants/*` has anonymous read (presigned not required for
  proxies); `originals/*` and `exports/*` require signed URLs (15-min expiry).

### Q8 — Collaboration: operation-log append vs CRDT vs OT

We chose an **operation-log append** model rather than a full CRDT or OT system:

- **OT** (Operational Transformation) requires a central server to transform
  concurrent ops in sequence — complex to implement correctly, especially for
  non-text operations like clip moves.
- **CRDT** (Conflict-free Replicated Data Type) fits text editing well but timeline
  semantics (overlapping clips, trim constraints) don't map cleanly to standard
  CRDT types.
- **Our approach**: each mutation (move, resize, split, effect toggle) is appended
  to `operation_logs` with full before/after state. The Pusher channel broadcasts
  the op to all connected clients, who apply it optimistically. On reconnect,
  clients re-fetch ops since their last known `id` and replay. Conflicts are rare
  (video editing is not free-text); when they occur, last-writer-wins on a per-clip
  basis is acceptable and matches user expectations from NLE tools like Premiere.

---

## Storage estimates (12-month horizon)

| Object | Avg size | Count | Total |
|---|---|---|---|
| Original videos | 800 MB | 500 k | 400 TB |
| Proxy videos (720p) | 80 MB | 500 k | 40 TB |
| Thumbnails | 50 KB | 2 M | 100 GB |
| Waveform JSON | 5 KB | 500 k | 2.5 GB |
| HLS variants (all) | 200 MB | 500 k | 100 TB |
| Export outputs | 200 MB | 120 k | 24 TB |
| **Postgres rows** | — | — | **~15 GB** |

MinIO storage in the dev environment is capped by host disk; the production bucket
(S3-compatible) needs ~540 TB for a 500 k-asset corpus. A lifecycle policy moves
originals to S3 Glacier after 90 days of no export.

---

## Migration runner notes

Migrations are plain SQL files named `NNNN_<slug>.sql` in `backend/migrations/`.
sqlx-cli applies them in order via `sqlx migrate run`. `0003_seed.sql` is guarded:
the Rust migration runner checks `CLOUDCUT_SEED_DATA=true` before executing it, so
it never runs in production.
