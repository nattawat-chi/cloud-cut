# CloudCut

Collaborative video editor SaaS — Rust backend + React 19 frontend.

> **Status:** Phase 0–5 complete — all phases done (monorepo + Docker + full frontend UI + PostgreSQL schema + Rust Axum API + Worker with Redis Streams + ffmpeg pipelines + Pusher real-time collaboration). See [Implementation phases](#implementation-phases) and [DEV_LOG.md](DEV_LOG.md) for the running journal.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend API | Rust 1.83 · Axum · SQLx · JWT · argon2 · utoipa OpenAPI |
| Worker | Rust · Redis Streams · ffmpeg CLI |
| Frontend | React 19 · TypeScript strict · Vite · shadcn/ui · Tailwind CSS · Zustand · Pusher JS |
| Database | PostgreSQL 16 |
| Queue / cache | Redis 7 |
| Object storage | MinIO (dev) · R2 / S3 (prod) |
| Realtime | Pusher Channels |

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

# 4. Run the backend placeholder (Rule 2 — Phase 3 wires the real router)
cargo run -p backend

# 5. Run the worker placeholder in another terminal (Rule 3)
cargo run -p worker
```

### Service URLs (host-side)

| Service | URL | Credentials |
|---------|-----|-------------|
| Backend API | http://localhost:8080 | — |
| Postgres | postgresql://cloudcut:cloudcut_dev@localhost:5432/cloudcut | cloudcut / cloudcut_dev |
| Redis | redis://localhost:6379 | — |
| MinIO S3 API | http://localhost:9000 | cloudcut / cloudcut_dev_secret |
| MinIO Console | http://localhost:9001 | cloudcut / cloudcut_dev_secret |
| Frontend (Phase 1) | http://localhost:5173 | — |

---

## Docker strategies

| File | Use case |
|------|----------|
| `docker-compose.yml` | **Default for dev.** Spins up infra only — Rust + frontend run natively on the host for fastest iteration. |
| `docker-compose.full.yml` | Adds containerized backend / worker / frontend with bind-mounted source and hot reload. Portable demo. |
| `docker-compose.prod.yml` | Production multi-stage release builds. Reads connection strings from `.env`. |

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

| Phase | Scope | Status |
|------:|-------|--------|
| **0** | Monorepo + Cargo workspace + Docker compose | ✅ Done |
| 1 | Frontend foundation + all UI phases (1.1–1.8) | ✅ Done |
| 2 | PostgreSQL schema + migrations + seed (`backend/migrations/`) | ✅ Done |
| 3 | Backend API: auth, projects, timeline, assets, exports | ✅ Done |
| 4 | Worker: Redis Streams + ffmpeg pipelines (metadata / proxy / thumbnails / waveform / export) | ✅ Done |
| 5 | Pusher integration: presence + operation sync | ✅ Done |

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

| Rule | Where it's enforced |
|------|---------------------|
| 1 — `cargo build` passes | `Cargo.toml` workspace + crate manifests |
| 2 — `cargo run -p backend` | `backend/src/main.rs` (placeholder; Phase 3 = real router) |
| 3 — `cargo run -p worker` | `worker/src/main.rs` (placeholder; Phase 4 = real consumer) |
| 4 — migrations run | `backend/migrations/` + `sqlx migrate run` (Phase 2) |
| 5 — auth / validation / authz / errors | Phase 3 |
| 6 — ffmpeg processes for real | `worker/Dockerfile` ships ffmpeg; Phase 4 invokes it |
| 7 — TS strict | Phase 1 (`tsconfig.json` `"strict": true`) |
| 8 / 9 — shadcn/ui, no other UI frameworks | Phase 1 |
| 10 — minimum tests | Each phase adds its slice |
| 11 — README.md | this file |
| 12 — DESIGN.md per crate | Phase 2/3/4/1 |
| 13 — `.env.example` | this commit |
| 14 — demo video / screenshots | After Phase 5 |
