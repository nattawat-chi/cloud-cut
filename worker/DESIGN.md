# Worker — Design notes

The worker is a Rust binary (`cargo run -p worker`) that consumes Redis Streams
populated by the backend API. It runs two pipelines: **asset processing**
(probe + proxy + thumbnail + waveform) and **export** (timeline composite),
with a dead-letter path for failed jobs.

Module layout:

```
worker/src/
├── main.rs              — bootstrap (ffmpeg probe, DB pool, S3 client, consumer)
├── config.rs            — env vars
├── error.rs             — WorkerError enum (transient vs permanent)
├── s3.rs                — upload_file / download_file (MinIO via aws-sdk-s3)
├── ffmpeg.rs            — probe(), make_proxy(), make_thumbnail(),
│                          make_waveform(), export_timeline()
├── consumer.rs          — XREADGROUP loop + XACK + DLQ
└── jobs/
    ├── mod.rs           — JobFields helper
    ├── process_asset.rs — full asset pipeline
    └── export.rs        — timeline composite
```

---

## Design decisions (§3.13)

### Q1 — Redis Streams vs Apalis vs Postgres job table

| | Redis Streams | Apalis | Postgres job table |
|---|---|---|---|
| Already in stack | ✓ | ✗ | ✓ |
| At-least-once delivery | ✓ | ✓ (Redis backend) | with `SELECT … FOR UPDATE SKIP LOCKED` |
| Consumer groups | ✓ native | wraps Streams | DIY |
| Replay history | ✓ XRANGE | partial | ✓ |
| Multi-stream blocking read | ✓ | per-queue | poll-only |

**Redis Streams direct, not Apalis.** Apalis is a nice abstraction but it
hides the consumer-group semantics we need to reason about for DLQ behaviour;
the layer of indirection makes XPENDING-driven retry counting awkward.

**Why not Postgres job table?** That'd save us a service for trivial volumes,
but we already need Redis for collaboration presence (Phase 5), and Streams'
`BLOCK` semantic beats polling `SELECT … FOR UPDATE` on idle latency.

### Q2 — Retry + dead-letter mechanics

After `WORKER_MAX_RETRIES` (default **3**) failed deliveries of the same
message, we move it to `<stream>:dlq` with the error captured, then ACK the
original so Redis stops re-delivering. Operators can replay from the DLQ
manually with `XRANGE` + `XADD`.

Delivery count is read from `XPENDING <stream> <group> <id> <id> 1` rather
than stored in the DB — Redis already tracks it per consumer-group entry.

Between attempts there's no explicit back-off; the consumer just doesn't ACK,
and Redis re-delivers on the next `XREADGROUP` for the message owner after
the visibility timeout. A future improvement is `XCLAIM` with exponential
back-off, owned by a separate "janitor" task.

### Q3 — Idempotency strategy

- **Asset variants** — `INSERT … ON CONFLICT (asset_id, variant) DO UPDATE`.
  Replays overwrite the row and re-upload to the same S3 key (object-level idempotent).
- **Asset metadata** — UPDATE with literal columns; re-running on a "ready"
  asset is a safe no-op (same probe → same values).
- **Export jobs** — not fully idempotent yet. A replay of a completed job
  would re-run ffmpeg. Mitigation: check `export_jobs.status = 'done'` at
  pipeline start and skip if so (one-line guard, not yet added).

We deliberately use the deterministic S3 key convention
(`variants/{asset_id}/{variant}.{ext}`) so retries can never produce duplicate
objects with different keys.

### Q4 — Shelling out to ffmpeg CLI vs FFI bindings

We use `tokio::process::Command` to launch the ffmpeg binary.

**Pros:**
- Zero compile-time coupling. ffmpeg evolves rapidly; the CLI surface is stable
  while the libav* C ABI breaks every few releases.
- Build matrix simplicity. `ffmpeg-next` (libav FFI) needs the dev headers
  installed at build time on every CI runner.
- Crash isolation. A segfault in ffmpeg kills the child process, not the worker.
- Hardware acceleration just works — install ffmpeg built with `--enable-nvenc`
  and the same `-c:v` flag picks it up.

**Cons:**
- Launch overhead (~10–30 ms per command). Negligible for jobs that run for seconds.
- Marshalling progress requires parsing stderr. We don't surface progress in
  Phase 4 (status flips processing → done at the end); future work parses
  ffmpeg's `progress=` pipe.
- Argument escaping is delicate. We pass each arg as a separate slice element
  so the shell never gets involved — no quoting bugs.

### Q5 — Memory + temp-file handling for long videos

Every job creates a `tempfile::TempDir`, downloads + writes inside it, and the
directory drops automatically at the end of the function (recursive cleanup).

For a 30-min 1080p source:
- Original: ~3 GB on disk.
- Proxy (720p H.264 CRF 23): ~250 MB.
- Thumbnail: ~50 KB.
- Waveform: ~14 KB.
- ffmpeg RSS peak: ~400 MB.

We stream the original from S3 via `aws-sdk-s3`'s `ByteStream`, but it lands
on disk before ffmpeg reads it (see Q3 of frontend/DESIGN.md for the
"why temp files, not pipes" rationale).

Worker pods need at least **3.5 GB disk** + **1 GB RAM**. Concurrent jobs
multiply both — capped by `WORKER_CONCURRENCY`.

### Q6 — Cancellation flow

Not yet implemented. The intended design:
1. Client calls `DELETE /api/v1/exports/:id` while status is `processing`.
2. Backend sets a Redis key `cloudcut:export:cancel:{job_id} = 1` with TTL 10 min.
3. The worker's export pipeline checks the key once per second (between ffmpeg
   I/O batches) via a `tokio::select!` race against the ffmpeg future.
4. On cancel, the worker SIGTERMs the ffmpeg child, marks the job
   `status='error', error_msg='cancelled'`, and ACKs.

Cancelling asset-processing jobs is intentionally not supported — they take
under 30 s on typical inputs and the engineering cost outweighs the win.

### Q7 — Horizontal worker scaling

Each worker pod has a unique consumer name (`worker-{hostname}`). Redis
Streams' consumer-group semantics guarantee that each message goes to exactly
one consumer in the group — adding pods just spreads load.

To scale safely:
- Workers must be **stateless** (no in-process caches that diverge across pods).
  ✓ — every read goes to Postgres / Redis / S3.
- Workers must tolerate **at-least-once** delivery. ✓ — see Q3.
- The DLQ stream is shared, so any worker can examine it.

On Kubernetes this is a `Deployment` with HPA driven by Redis stream length
(`XLEN cloudcut:exports`). Recommended initial floor: 2 pods (one absorbs the
other's crash window).

### Q8 — Cost estimate for a 5-minute 1080p export

Reference machine: AWS `c7g.xlarge` (4 vCPU ARM, on-demand $0.145/hr in us-east-1).

| Stage | Wall time | CPU-seconds |
|---|---|---|
| Download proxies (5 × 80 MB @ 50 MB/s) | ~8 s | ~5 |
| ffmpeg composite (libx264 CRF 20, preset medium, 4 vCPU) | ~75 s | ~290 |
| Upload output (~150 MB @ 50 MB/s) | ~3 s | ~2 |
| Postgres + bookkeeping | ~1 s | <1 |
| **Total** | **~90 s** | **~298** |

Cost = 90 s × $0.145/hr × (1/3600) = **$0.0036** per 5-min export, **before
S3 storage + egress**. Egress to a viewer downloading the output:
150 MB × $0.09/GB = $0.014 if served from S3 directly, or $0.005 via
CloudFront origin pull. So the dominant cost is bandwidth, not compute.

For a year-1 plan of 50 k exports/month, compute ≈ $180/mo, egress ≈ $700/mo.
Roughly an order of magnitude under the storage costs documented in
[docs/database-design.md](../docs/database-design.md).

---

## Local smoke test

```powershell
# 1. infra up
docker compose up -d postgres redis minio

# 2. apply migrations (from repo root)
$env:DATABASE_URL = "postgres://cloudcut:cloudcut_dev@localhost:5432/cloudcut"
sqlx migrate run --source backend/migrations

# 3. start backend (separate terminal)
cargo run -p backend

# 4. start worker (separate terminal)
cargo run -p worker

# 5. trigger an export via API
curl -X POST http://localhost:8080/api/v1/projects/<id>/exports `
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" `
  -d '{"format":"mp4","resolution":"720"}'
```

Watch the `tracing` output on both processes — the worker should log
`starting export → export complete` and you'll see the output in MinIO at
`exports/<project_id>/<job_id>/output.mp4`.
