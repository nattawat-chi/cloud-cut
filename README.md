# CloudCut

Collaborative video editor SaaS — Rust backend + React 19 frontend.
🎬 Watch the full Demo Video here: [https://youtu.be/WiScYen_eR8]

> **Status:** Phase 0–5 complete — all phases done (monorepo + Docker + full frontend UI + PostgreSQL schema + Rust Axum API + Worker with Redis Streams + ffmpeg pipelines + Pusher real-time collaboration). See [Implementation phases](#implementation-phases) and [DEV_LOG.md](DEV_LOG.md) for the running journal.

---

## Stack

| Layer          | Tech                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| Backend API    | Rust 1.83 · Axum · SQLx · JWT · argon2 · utoipa OpenAPI                              |
| Worker         | Rust · Redis Streams · ffmpeg CLI                                                    |
| Frontend       | React 19 · TypeScript strict · Vite · shadcn/ui · Tailwind CSS · Zustand · Pusher JS |
| Database       | PostgreSQL 16                                                                        |
| Queue / cache  | Redis 7                                                                              |
| Object storage | MinIO (dev) · R2 / S3 (prod)                                                         |
| Realtime       | Pusher Channels                                                                      |

---

## Repo layout

```
cloudcut/
├── backend/                # Rust API (Axum) — Phase 3
│   ├── src/
│   ├── migrations/         # SQLx migrations — Phase 2
│   ├── tests/
│   ├── Cargo.toml
│   ├── Dockerfile          # production multi-stage
│   └── Dockerfile.dev      # cargo-watch hot reload
│
├── worker/                 # Rust queue worker + ffmpeg — Phase 4
│   ├── src/
│   ├── tests/
│   ├── Cargo.toml
│   ├── Dockerfile          # production (includes ffmpeg)
│   └── Dockerfile.dev
│
├── frontend/               # React 19 + Vite — Phase 1
│
├── docker/
│   ├── postgres/init.sql   # extensions
│   └── minio/setup.sh      # bucket bootstrap
│
├── docs/
│   ├── architecture.md
│   ├── api-spec.md
│   ├── database-design.md
│   └── prototype/          # original HTML/JSX design (reference only)
│
├── docker-compose.yml      # infra only (default)
├── docker-compose.full.yml # +backend/worker/frontend containers
├── docker-compose.prod.yml # production builds
├── Cargo.toml              # workspace manifest
├── .env.example
└── README.md
```

---

## Quick start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Boot infrastructure (Postgres + Redis + MinIO)
docker compose up -d

# 3. Verify everything is healthy
docker compose ps
#   → all services should be `healthy` (minio-setup will exit 0 after seeding)

# 4. Apply database migrations (creates tables + seeds demo data)
cargo install sqlx-cli --no-default-features --features postgres   # one-time
sqlx migrate run --source backend/migrations \
                 --database-url postgresql://cloudcut:cloudcut_dev@localhost:5432/cloudcut

# 5. Run the backend in one terminal (Rule 2)
cargo run -p backend

# 6. Run the worker in another terminal (Rule 3)
cargo run -p worker

# 7. Run the frontend in a third terminal
cd frontend && pnpm install && pnpm dev
#   → http://localhost:5173
```

> Migrations are also auto-applied at backend startup via `sqlx::migrate!()` — step 4 is only needed for standalone setups (CI, fresh clones without the backend running).

### Service URLs (host-side)

| Service              | URL                                                        | Credentials                    |
| -------------------- | ---------------------------------------------------------- | ------------------------------ |
| Backend API          | http://localhost:8080                                      | —                              |
| Postgres             | postgresql://cloudcut:cloudcut_dev@localhost:5432/cloudcut | cloudcut / cloudcut_dev        |
| Redis                | redis://localhost:6379                                     | —                              |
| MinIO S3 API         | http://localhost:9000                                      | cloudcut / cloudcut_dev_secret |
| MinIO Console        | http://localhost:9001                                      | cloudcut / cloudcut_dev_secret |
| Frontend (Phase 1)   | http://localhost:5173                                      | —                              |
| Swagger UI (OpenAPI) | http://localhost:8080/swagger-ui                           | —                              |

---

## Environment variables

`.env.example` holds the full template — copy it to `.env` and edit. Highlights:

| Variable                                       | Purpose                             | Notes                                                         |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                                 | Postgres connection string          | host-mode uses `localhost:5432`                               |
| `REDIS_URL`                                    | Redis (queue + rate-limit counters) | `redis://localhost:6379`                                      |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_*_KEY`       | MinIO/S3 object storage             | dev creds: `cloudcut` / `cloudcut_dev_secret`                 |
| `S3_PRESIGN_EXPIRES_SECS`                      | Presigned PUT/GET URL TTL           | default `900`                                                 |
| `S3_PUBLIC_URL`                                | Browser-facing bucket base URL      | for thumbnails / proxy MP4s                                   |
| `JWT_SECRET`                                   | HMAC-SHA256 signing key             | **must be ≥ 32 bytes in prod**                                |
| `JWT_ACCESS_EXP_SECS` / `JWT_REFRESH_EXP_SECS` | Token lifetimes                     | 15 min / 7 d                                                  |
| `BACKEND_HOST` / `BACKEND_PORT`                | Axum bind                           | default `0.0.0.0:8080`                                        |
| `RUST_LOG`                                     | tracing filter                      | e.g. `backend=debug,sqlx=warn`                                |
| `WORKER_CONCURRENCY` / `WORKER_MAX_RETRIES`    | worker tuning                       | concurrent jobs + DLQ threshold                               |
| `PUSHER_APP_ID` / `KEY` / `SECRET` / `CLUSTER` | Pusher Channels                     | **leave blank to disable** real-time — UI degrades gracefully |
| `VITE_API_BASE`                                | Frontend → Backend prefix           | proxied through Vite dev server                               |
| `VITE_S3_PUBLIC_URL`                           | Frontend asset URL builder          | must match `S3_PUBLIC_URL`                                    |
| `VITE_PUSHER_KEY` / `VITE_PUSHER_CLUSTER`      | Frontend Pusher client              | mirror of backend keys                                        |

---

## Database migrations

Migrations live in [`backend/migrations/`](backend/migrations/) (raw SQL, applied in numeric order):

```bash
# Apply migrations to a running Postgres
sqlx migrate run --source backend/migrations \
                 --database-url $DATABASE_URL

# Roll back the most recent migration
sqlx migrate revert --source backend/migrations \
                    --database-url $DATABASE_URL
```

Schema rationale: [`docs/database-design.md`](docs/database-design.md).

---

## Architecture

```
                     ┌─────────────┐
                     │  Browser    │  React 19 · Vite · shadcn/ui · Zustand
                     └─────┬───────┘
            REST + Pusher  │
                           ▼
                     ┌─────────────┐
                     │  Backend    │  Rust · Axum · JWT · SQLx · utoipa
                     │  (port 8080)│
                     └──┬──────┬───┘
              SQL       │      │ enqueue (XADD)
                        ▼      ▼
                ┌────────────┐ ┌──────────────┐
                │ PostgreSQL │ │ Redis Streams│  rate-limit counters + DLQ
                └────────────┘ └──────┬───────┘
                                      │ XREADGROUP
                                      ▼
                              ┌──────────────┐
                              │ Worker (Rust)│  ffmpeg CLI (probe/proxy/export)
                              └──────┬───────┘
                                     │ PUT / GET
                                     ▼
                              ┌──────────────┐
                              │ MinIO / S3   │  originals/ + variants/ + exports/
                              └──────────────┘
```

Full diagram + sequence flows: [`docs/architecture.md`](docs/architecture.md).

---

## API documentation

The backend exposes an auto-generated OpenAPI 3 spec at runtime via **utoipa**:

| URL                                         | Purpose                                         |
| ------------------------------------------- | ----------------------------------------------- |
| http://localhost:8080/swagger-ui            | Interactive Swagger UI — try endpoints directly |
| http://localhost:8080/api-docs/openapi.json | Raw OpenAPI JSON for codegen / Postman import   |

Static reference: [`docs/api-spec.md`](docs/api-spec.md).

---

## Screenshots

Live screenshots of the running editor are in [`docs/screenshots/`](docs/screenshots/).

|                                              |                                                             |
| -------------------------------------------- | ----------------------------------------------------------- |
| Editor (timeline + preview + inspector)      | ![editor](docs/screenshots/cloudcut-screenshot.png)         |
| Export dialog with live quota                | ![export](<docs/screenshots/cloudcut-screenshot%20(2).png>) |
| Real-time collaboration (cursors + presence) | ![collab](<docs/screenshots/cloudcut-screenshot%20(5).png>) |

Capture instructions are in [`docs/screenshots/README.md`](docs/screenshots/README.md).

---

## Known limitations

- **Single-track export.** The worker renders clips from the lowest-`position` non-muted video track only. Overlay compositing (V2 on V1) is a future enhancement — the spec calls for "main video track" per §3.7.
- **Audio mixing is best-effort.** Audio-track clips are mixed via ffmpeg `amix=duration=first`. Long audio that extends past the video gets cleanly trimmed; gain normalisation is automatic and not user-tunable yet.
- **`ByteStream::from_path` upload, no chunk callbacks.** The worker bumps the export progress bar from 95 → 99 % via a time-based ticker during S3 PUT because the AWS Rust SDK doesn't expose per-chunk upload progress.
- **Plan management is SQL-only.** No `PATCH /workspaces/:id/plan` endpoint or admin UI — change a workspace's tier with `UPDATE workspaces SET plan='pro' WHERE id=…`. Plan badge + live quota display _is_ in the UI (topbar + Export dialog).
- **Pusher client events require dashboard toggle.** Mouse-cursor broadcast uses `client-*` events; if the Pusher app has "Client events" off, cursor sharing silently no-ops (rest of collab still works via server-broadcast clip ops).
- **Mock-data fallback when backend unreachable.** Boot-time API failure (no workspaces / 5xx) loads `MOCK_PROJECT`. The session is interactive but edits aren't persisted — useful for offline UI work, surprising if you forgot to start the backend.
- **Concurrent-export slot can leak.** Mitigated by 24h Redis TTL; can leak by one slot if the worker hard-crashes between `release_export_slot` and Redis acknowledging the DECR. Safe in practice — TTL auto-recovers.
- **Asset deletion blocked while referenced.** `DELETE /assets/:id` returns 409 if any clip on any project still references it. Caller has to remove clips first — no force-delete.

---

## Future improvements

- **Multi-track export with overlay composition** — port the `clipAtTime` topmost-wins logic from the frontend into the ffmpeg filter graph (`overlay` + `enable='between(t,…)'`).
- **Per-clip audio gain / mute** — currently track-level only.
- **Owner-only plan management UI** — `PATCH /workspaces/:id/plan` + Settings dropdown. Stripe billing wiring as a stretch goal.
- **Stripe self-serve billing** — checkout session → webhook → `UPDATE workspaces SET plan=…`. Already factored cleanly thanks to per-workspace plan column.
- **Real-time playhead sync across collaborators** — `client-playhead:seek` is broadcast but receivers don't yet snap their own scrubber.
- **Resumable uploads** — multipart S3 PUT with browser-side progress + retry. The current pre-signed single PUT works fine up to ~1 GB but stalls on flaky connections.
- **Versioned timeline snapshots** — checkpoint a project every N ops so collaborators with stale state can rebase instead of pulling the whole `/timeline` payload.
- **Pusher → Redis pubsub fallback** — for self-hosted demos where Pusher isn't available.
- **Worker auto-scaling** — currently one worker process. Spec is ready for horizontal scale (consumer-group XREADGROUP), just needs an orchestrator.
- **E2E tests via Playwright** — current tests are unit (Vitest) + integration (cargo `tests/`). A full upload→edit→export smoke test would close the loop.

---

## Docker strategies

| File                      | Use case                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`      | **Default for dev.** Spins up infra only — Rust + frontend run natively on the host for fastest iteration. |
| `docker-compose.full.yml` | Adds containerized backend / worker / frontend with bind-mounted source and hot reload. Portable demo.     |
| `docker-compose.prod.yml` | Production multi-stage release builds. Reads connection strings from `.env`.                               |

```bash
# Infra only (recommended for dev)
docker compose up -d

# Full stack in containers
docker compose -f docker-compose.yml -f docker-compose.full.yml up

# Production build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## Implementation phases

| Phase | Scope                                                                                        | Status  |
| ----: | -------------------------------------------------------------------------------------------- | ------- |
| **0** | Monorepo + Cargo workspace + Docker compose                                                  | ✅ Done |
|     1 | Frontend foundation + all UI phases (1.1–1.8)                                                | ✅ Done |
|     2 | PostgreSQL schema + migrations + seed (`backend/migrations/`)                                | ✅ Done |
|     3 | Backend API: auth, projects, timeline, assets, exports                                       | ✅ Done |
|     4 | Worker: Redis Streams + ffmpeg pipelines (metadata / proxy / thumbnails / waveform / export) | ✅ Done |
|     5 | Pusher integration: presence + operation sync                                                | ✅ Done |

Phase-level design docs live next to their crates: `backend/DESIGN.md`, `worker/DESIGN.md`, `frontend/DESIGN.md`. Cross-cutting docs are under `docs/`.

---

## Reference prototype

The original HTML/JSX prototype handed over from Claude Design is preserved at
`docs/prototype/Cloud_Cut_Editor.html`. It is **reference only** — Phase 1
ports it into a production React 19 + Vite + shadcn/ui codebase under
`frontend/`. To eyeball the prototype, serve the folder over HTTP and open the
file (it pulls React + Babel from a CDN at runtime).

---

## Rules compliance (test brief)

| Rule                                             | Status | Where it's enforced                                                                                                                                                                   |
| ------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — `cargo build` passes clean                   |   ✅   | Workspace `Cargo.toml` — verified 0 warn / 0 err                                                                                                                                      |
| 2 — `cargo run -p backend` boots Axum            |   ✅   | [`backend/src/main.rs`](backend/src/main.rs) — full router, 28 routes                                                                                                                 |
| 3 — `cargo run -p worker` consumes Redis Streams |   ✅   | [`worker/src/main.rs`](worker/src/main.rs) — XREADGROUP loop, ffmpeg pipelines                                                                                                        |
| 4 — migrations run                               |   ✅   | [`backend/migrations/0001..0003`](backend/migrations/) — `sqlx migrate run` applies + seeds                                                                                           |
| 5 — auth + validation + authz + errors           |   ✅   | Argon2id + JWT + `validator` + `AppError` + `require_*_access` helpers                                                                                                                |
| 6 — ffmpeg processes for real                    |   ✅   | [`worker/src/ffmpeg.rs`](worker/src/ffmpeg.rs) — probe / proxy / thumbnail / waveform / export                                                                                        |
| 7 — TypeScript strict                            |   ✅   | [`frontend/tsconfig.app.json`](frontend/tsconfig.app.json) — all strict flags on                                                                                                      |
| 8 / 9 — shadcn/ui only, no other UI frameworks   |   ✅   | Vendored under `frontend/src/components/ui/`; no MUI/AntD/etc. in `package.json`                                                                                                      |
| 10 — minimum tests                               |   ✅   | 59 Vitest (timecode, geometry, snap, projectStore, playback, waveform) + 3 cargo tests                                                                                                |
| 11 — `README.md` setup instructions              |   ✅   | this file (quick start + service URLs + Docker strategies)                                                                                                                            |
| 12 — `DESIGN.md` per module                      |   ✅   | [`backend/DESIGN.md`](backend/DESIGN.md) · [`worker/DESIGN.md`](worker/DESIGN.md) · [`frontend/DESIGN.md`](frontend/DESIGN.md) · [`docs/database-design.md`](docs/database-design.md) |
| 13 — `.env.example`                              |   ✅   | [`.env.example`](.env.example) — all vars documented                                                                                                                                  |
| 14 — demo video / screenshots                    |   ⏳   | Run locally and capture (see Quick start below)                                                                                                                                       |

### Definition of Done

| #   | Item                               | Status | Evidence                                                                                                                                               |
| --- | ---------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Frontend opens                     |   ✅   | `pnpm dev` → http://localhost:5173                                                                                                                     |
| 2   | Login works                        |   ✅   | `<AuthPage>` form → POST `/auth/login` → JWT in `authStore` (seed: `alice@cloudcut.dev` / `password123`)                                               |
| 3   | Project opens                      |   ✅   | After login, App auto-fetches `/workspaces` → `/projects` → `/projects/:id/timeline`                                                                   |
| 4   | Timeline shows tracks + clips      |   ✅   | Hydrated from real DB; 4 tracks + clips render in the editor                                                                                           |
| 5   | Drag/trim/split clip               |   ✅   | Works on local Zustand store (PATCH-to-backend persistence is a future enhancement)                                                                    |
| 6   | Upload asset → backend creates job |   ✅   | Upload button → presign → MinIO PUT → PATCH status=processing → `XADD cloudcut:assets`                                                                 |
| 7   | Worker calls ffmpeg                |   ✅   | Verified: worker processes asset in ~1s, generates `proxy.mp4` + `thumbnail.jpg` + `waveform.json`                                                     |
| 8   | Export video                       |   ✅   | ExportDialog (TopBar → Export) → format + 4-res picker → POST `/exports` → worker composites + uploads `output.mp4`                                    |
| 9   | Pusher presence / operation sync   |   ✅   | Real `pusher-js` subscribes to `presence-project-<id>`; backend signs auth + publishes ops. Falls back to scripted `CollabSimulator` when keys missing |
| 10  | Tests pass                         |   ✅   | 59/59 Vitest + 3/3 cargo                                                                                                                               |
| 11  | README + DESIGN.md complete        |   ✅   | This file + `backend/DESIGN.md` + `worker/DESIGN.md` + `frontend/DESIGN.md` + `docs/database-design.md`                                                |

**Real Pusher integration** (a separate spec requirement, not a numbered rule): backend signs presence/private channels via hand-rolled HMAC-SHA256 in [`backend/src/pusher/`](backend/src/pusher/) and publishes timeline ops to `presence-project-<id>`; frontend subscribes via [`pusher-js`](frontend/src/services/pusher.ts) and mirrors remote ops into `projectStore`. Falls back gracefully to the scripted `CollabSimulator` when Pusher env vars are missing.
