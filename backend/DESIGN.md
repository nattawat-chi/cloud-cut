# Backend — Design notes

## Database layer (Phase 2 — complete)

Schema lives in `migrations/`. Full rationale in [`docs/database-design.md`](../docs/database-design.md).

Key points relevant to the Rust layer:

- **UUID PKs** — generated with `gen_random_uuid()` in Postgres; Rust pre-generates with `Uuid::new_v4()` before the INSERT, so the ID is known before the round-trip.
- `operation_logs` has no FK to `projects` — the Axum handler validates project existence before inserting.
- `clip_effects.position` drives ffmpeg filter-graph order — handler returns effects sorted by `position`.
- Migrations run via `sqlx migrate run`; seed guarded by `CLOUDCUT_SEED_DATA=true`.

---

## API layer (Phase 3 — complete)

### Q1 — Why Axum over Actix-web?

Both are mature and fast. Axum was chosen because:

1. **Tower ecosystem** — middleware (CORS, tracing, request-id) plug in through the same `Layer` interface used by the rest of the stack. Adding rate-limiting or auth middleware is a one-liner.
2. **Extractor composability** — `AuthUser`, `State<AppState>`, `Path<Uuid>` are just function arguments; no manual `FromRequest` boilerplate in handlers. The compiler enforces that each handler receives exactly what it declares.
3. **Single async runtime** — Axum is built directly on Tokio; no actix-rt compatibility shim needed when sharing a thread pool with the future Redis consumer (Phase 4).

Actix would have been the right call for raw throughput at >100 k RPS — at CloudCut's scale Axum's ergonomics win.

### Q2 — Why SQLx over SeaORM / Diesel?

| Concern | SQLx | SeaORM / Diesel |
|---|---|---|
| Compile-time safety | Macro-checked SQL (when offline DB cache present); runtime-checked otherwise | ORM-generated queries; compile-time safe but abstracted |
| Control | Raw SQL — trivial to write window functions, CTEs, partition queries | DSL limits: complex queries require raw SQL escape hatch anyway |
| Async | Native async (Tokio) | SeaORM async; Diesel sync-only until diesel-async |
| Migration story | `sqlx migrate run` — plain SQL files version-controlled | SeaORM migrations code-generated; less readable diffs |

We use the **runtime (non-macro)** SQLx API (`query()` / `query_as::<_, Row>()`) so `cargo build` succeeds without a running database. This is the right trade-off for a CI environment where the DB is a Docker service.

### Q3 — Cursor-based pagination

Project listing uses keyset / cursor pagination instead of `OFFSET`:

```
cursor = base64_url_no_pad("{updated_at_rfc3339}|{uuid}")
```

Query:
```sql
WHERE workspace_id = $1
  AND archived = false
  AND (updated_at, id) < ($cursor_ts, $cursor_id)
ORDER BY updated_at DESC, id DESC
LIMIT $limit + 1
```

The `+1` trick detects whether another page exists without a COUNT query. The composite `(updated_at, id)` predicate is stable — no phantom rows appear as other users edit projects. UUID acts as tie-breaker when two projects share the same `updated_at` timestamp.

**Why not OFFSET?** With OFFSET, inserting a new project during pagination shifts all subsequent rows, causing duplicates or skips.

### Q4 — Presigned upload flow

```
Client                   Backend              MinIO/S3            Worker
  │                         │                    │                  │
  ├──POST /assets/presign──>│                    │                  │
  │  { filename, kind }     │                    │                  │
  │                         ├──INSERT assets──>DB│                  │
  │                         │   status=uploading  │                  │
  │                         ├──PutObject.presign─>│                  │
  │<──{ upload_url, id }────┤                    │                  │
  │                         │                    │                  │
  ├────PUT file─────────────────────────────────>│                  │
  │  (direct, no backend)   │                    │                  │
  │                         │                    │                  │
  ├──PATCH /assets/:id/status (processing)──────>│                  │
  │                         ├──UPDATE assets──>DB│                  │
  │                         │                    ├──notify Worker──>│
  │                         │                    │                  │
  │                         │                    │         ffmpeg proxy+thumb
  │                         │                    │<──PUT variants───┤
  │                         │                    │                  │
  │<──PATCH status ready────┤ (Worker calls back)│                  │
```

### Q5 — Why upload directly to MinIO and not through the backend?

Routing a 500 MB video through the backend would:
- Block a Tokio thread during the entire multipart upload
- Add 2× bandwidth cost (client → backend → MinIO)
- Risk memory pressure if multiple concurrent uploads buffer simultaneously

The presigned PUT offloads all byte-transfer work to MinIO. The backend only touches metadata rows.

### Q6 — Batch clip operations: atomic vs partial success

Timeline mutations (`moveClip`, `resizeClip`, `splitClip`) are **atomic per-operation**: each is a single `UPDATE` wrapped in an implicit Postgres transaction. We do not expose a bulk endpoint in Phase 3.

When a future batch endpoint is needed (e.g. "delete 5 clips"), the strategy is:
- **Atomic** — `DELETE FROM clips WHERE id = ANY($1)` in one statement; either all succeed or none do.
- **Partial success is wrong here** — a half-deleted timeline would be inconsistent.
- Return the list of deleted IDs so the client can reconcile optimistically.

### Q7 — API versioning strategy

All routes are prefixed `/api/v1`. When a breaking change is needed:

1. New handlers go under `/api/v2/...`.
2. `/api/v1/...` stays live until all clients upgrade (tracked via `User-Agent` or custom `X-Client-Version` header).
3. Sunset header (`Sunset: Sat, 01 Jan 2027 00:00:00 GMT`) is added to v1 responses once v2 ships.

We deliberately avoid URL-less versioning (Accept header / query param) because it complicates CDN caching.

### Q8 — Where does authorization live?

Three-tier approach:

| Layer | Mechanism | What it checks |
|---|---|---|
| **Extractor** | `AuthUser` implements `FromRequestParts<AppState>` | JWT validity + signature + expiry — runs before the handler body |
| **Handler** | `require_project_access(state, project_id, user_id)` helper | Workspace membership — DB query per request |
| **Query** | `WHERE workspace_id = $1 AND NOT archived` | Data ownership — row-level guard built into every SELECT |

This is defence-in-depth: even if a bug bypasses the helper call, the query predicate still scopes results to the authenticated user's workspaces.

Role-based controls (owner vs editor vs viewer) are stored in `workspace_members.role` and enforced in the handler helpers. Phase 5 will add granular per-project permissions.

### Q9 — Error handling strategy

`AppError` is a `thiserror` enum that implements `axum::IntoResponse`:

```json
{ "error": "human-readable message", "code": "MACHINE_CODE" }
```

Rules:
- **5xx** responses never leak internal detail — the client sees `"internal server error"` regardless of the real cause; the real cause is logged via `tracing::error!`.
- **4xx** responses include a specific human message safe to display.
- `sqlx::Error` and `redis::RedisError` implement `From<E> for AppError` so handlers can use `?` without `.map_err(...)` boilerplate.
- Validation errors (from `validator::Validate`) surface as `400 VALIDATION_ERROR` with the field constraint message.

---

## Module layout

```
backend/src/
├── main.rs          — router assembly, server startup
├── config.rs        — Config struct from env (fail-fast on startup)
├── error.rs         — AppError → JSON HTTP response
├── state.rs         — AppState (PgPool, Redis, S3, Config)
├── auth/
│   ├── extractor.rs — AuthUser FromRequestParts (JWT → user_id)
│   ├── handlers.rs  — register, login, refresh, logout, me
│   ├── jwt.rs       — HS256 encode/decode
│   └── models.rs    — DTOs + UserRow
├── projects/        — CRUD + cursor pagination
├── timeline/        — tracks + clips + effects + bulk snapshot
├── assets/          — presigned PUT + asset listing
└── exports/         — job creation + Redis Stream enqueue + status polling
```

## Route table

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/v1/health` | — | Liveness probe |
| POST | `/api/v1/auth/register` | — | Create account |
| POST | `/api/v1/auth/login` | — | Issue token pair |
| POST | `/api/v1/auth/refresh` | — | Rotate access token |
| POST | `/api/v1/auth/logout` | ✓ | Revoke refresh token |
| GET | `/api/v1/auth/me` | ✓ | Current user profile |
| GET | `/api/v1/workspaces/:id/projects` | ✓ | List projects (cursor) |
| POST | `/api/v1/workspaces/:id/projects` | ✓ | Create project |
| GET | `/api/v1/projects/:id` | ✓ | Get project |
| PATCH | `/api/v1/projects/:id` | ✓ | Update project |
| DELETE | `/api/v1/projects/:id` | ✓ | Archive project |
| GET | `/api/v1/projects/:id/timeline` | ✓ | Bulk timeline snapshot |
| GET | `/api/v1/projects/:id/tracks` | ✓ | List tracks |
| POST | `/api/v1/projects/:id/tracks` | ✓ | Create track |
| PATCH | `/api/v1/tracks/:id` | ✓ | Update track |
| DELETE | `/api/v1/tracks/:id` | ✓ | Delete track |
| POST | `/api/v1/tracks/:id/clips` | ✓ | Add clip |
| PATCH | `/api/v1/clips/:id` | ✓ | Move / resize clip |
| DELETE | `/api/v1/clips/:id` | ✓ | Delete clip |
| POST | `/api/v1/clips/:id/split` | ✓ | Split clip |
| POST | `/api/v1/clips/:id/effects` | ✓ | Add effect |
| PATCH | `/api/v1/effects/:id` | ✓ | Update effect |
| DELETE | `/api/v1/effects/:id` | ✓ | Delete effect |
| GET | `/api/v1/workspaces/:id/assets` | ✓ | List assets |
| POST | `/api/v1/workspaces/:id/assets/presign` | ✓ | Get presigned PUT URL |
| PATCH | `/api/v1/assets/:id/status` | ✓ | Advance asset status |
| POST | `/api/v1/projects/:id/exports` | ✓ | Queue export job |
| GET | `/api/v1/projects/:id/exports` | ✓ | List export jobs |
| GET | `/api/v1/exports/:id` | ✓ | Get export job status |
