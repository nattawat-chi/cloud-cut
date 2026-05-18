# CLAUDE.md — context for AI sessions

> Read this file end-to-end on every fresh session. It captures the
> non-obvious context that makes this codebase make sense: what each
> directory does, which decisions are locked, what bugs we've already
> fixed (don't reintroduce them), and what's still on the punch list.

---

## What this project is

**CloudCut** is a collaborative video editor SaaS submitted as a Mid-Senior
full-stack engineering test (Rust backend + ffmpeg worker + React 19 frontend
+ Pusher realtime). The full spec lives at
`C:\Users\Cobalt\Desktop\cloudcut-mid-test.md` and lists 14 rules + 5 tasks +
40 DESIGN questions across §1.4 / §2.7 / §3.13 / §4.8 / §5.10.

Working branch is **`dev`** on `git@github.com:nattawat-chi/cloud-cut.git`.
`main` is held at Phase 2 — we'll merge `dev → main` once the punch list
clears.

---

## Repo layout

```
cloud-cut-readiness-test/
├── Cargo.toml                # Workspace: backend + worker
├── docker-compose.yml        # postgres + redis + minio (dev infra only)
├── docker-compose.full.yml   # + backend + worker + frontend (full stack in containers)
├── docker-compose.prod.yml   # production multi-stage builds
├── .env                      # **READ AT STARTUP ONLY by Rust (dotenvy) AND Vite (envDir=..)**
├── .env.example              # Template — never put real secrets here
├── README.md                 # User-facing setup guide
├── DEV_LOG.md                # Running journal, decisions D-001..D-031, gotchas G-001..G-007
├── CLAUDE.md                 # ← this file
│
├── backend/                  # Axum API, JWT auth, SQLx, Pusher REST trigger
│   ├── Cargo.toml
│   ├── migrations/
│   │   ├── 0001_init.sql             # core schema + enums + partitioned operation_logs
│   │   ├── 0002_indexes.sql          # commented index strategy
│   │   ├── 0003_seed.sql             # 2 users (Alice/Mira, pwd=password123), 1 workspace, 1 project, 4 tracks, 3 assets, 3 clips
│   │   └── 0004_asset_progress.sql   # adds progress_pct column
│   ├── src/
│   │   ├── main.rs                   # Axum router assembly, CORS, tracing
│   │   ├── config.rs                 # Env vars → Config struct (fail-fast)
│   │   ├── error.rs                  # AppError enum → JSON {error, code}
│   │   ├── state.rs                  # AppState { db, redis, config, s3, pusher? }
│   │   ├── auth/                     # /register /login /refresh /logout /me + AuthUser extractor
│   │   ├── projects/                 # CRUD + cursor pagination
│   │   ├── timeline/                 # tracks + clips + effects + split + bulk snapshot + Pusher publish
│   │   ├── assets/                   # list + presign + status PATCH + DELETE
│   │   ├── exports/                  # POST→Redis XADD, GET status, list
│   │   └── pusher/                   # HMAC-SHA256 channel-auth signer + REST event trigger
│   ├── tests/api_tests.rs            # 3 stub tests (router boots, error shapes)
│   └── DESIGN.md                     # §2.7 Q1-Q9 answered
│
├── worker/                   # Rust binary: Redis Streams consumer + ffmpeg
│   ├── src/
│   │   ├── main.rs                   # ffmpeg presence check + spawn consumer
│   │   ├── config.rs / error.rs
│   │   ├── consumer.rs               # XREADGROUP loop + XACK + DLQ at <stream>:dlq
│   │   ├── ffmpeg.rs                 # probe / proxy / thumbnail / waveform / export
│   │   ├── s3.rs                     # aws-sdk-s3 download/upload (MinIO-compatible)
│   │   └── jobs/
│   │       ├── process_asset.rs      # download original → probe → variants → ready
│   │       └── export.rs             # load timeline → download originals → ffmpeg composite → upload
│   └── DESIGN.md                     # §3.13 Q1-Q8 answered
│
├── frontend/                 # Vite + React 19 + TS strict + Tailwind v4 + shadcn/ui + Zustand v5
│   ├── package.json                  # pnpm workspace
│   ├── vite.config.ts                # envDir="..", proxy /api → :8080
│   ├── src/
│   │   ├── App.tsx                   # auth gate + project hydrate + overlays
│   │   ├── services/api.ts           # Typed HTTP client w/ 401 silent refresh + custom error
│   │   ├── services/pusher.ts        # singleton; null when VITE_PUSHER_KEY missing
│   │   ├── state/
│   │   │   ├── authStore.ts          # JWT + refresh, persisted to localStorage
│   │   │   ├── projectStore.ts       # project/tracks/clips/effects + snapshot undo + remote-op actions
│   │   │   ├── assetsStore.ts        # workspace assets cache + polling
│   │   │   ├── uiStore.ts            # selection/zoom/scroll/snap/preset/theme/overlays
│   │   │   ├── playbackStore.ts      # currentTimeMs/isPlaying/volume
│   │   │   └── collabStore.ts        # collaborators + cursors (driven by CollabClient)
│   │   ├── hooks/
│   │   │   ├── useAssetUpload.ts     # 3-step presign → PUT → status PATCH
│   │   │   ├── useAssetsHydration.ts # fetch + 3s poll while anything processing
│   │   │   ├── usePlaybackTicker.ts  # RAF loop reading getState() to avoid effect re-runs
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   └── useTheme.ts
│   │   ├── components/
│   │   │   ├── auth/AuthPage.tsx
│   │   │   ├── layout/EditorLayout.tsx
│   │   │   ├── topbar/{TopBar,Presence}.tsx
│   │   │   ├── assets/{AssetBrowser,AssetRow,AssetThumb,AssetStatusPill}.tsx
│   │   │   ├── timeline/{Timeline,TimelineClip,TimelineRuler,TimelineToolbar,TrackHeader,Playhead}.tsx
│   │   │   ├── player/{VideoPlayer,MockFrame,PlayerControls}.tsx   # <video> when proxyUrl exists, else MockFrame
│   │   │   ├── inspector/{InspectorPanel,PropsTab,EffectsTab,EffectCard,TransformEditor}.tsx
│   │   │   ├── collaboration/{CollabClient,ViewportCursors}.tsx    # CollabClient is Pusher-only (CollabSimulator deleted)
│   │   │   └── overlays/{ShortcutsOverlay,EffectsBrowser,HistoryPanel,ToastStack,ExportDialog}.tsx
│   │   ├── utils/{timecode,geometry,playback,waveform,id}.ts
│   │   ├── types/index.ts            # All shared TS types live here
│   │   └── mocks/cloudcut.ts         # MOCK_* fixtures — only used when loadMockProject() runs
│   ├── tests/                        # 60 Vitest tests
│   └── DESIGN.md                     # §5.10 Q1-Q7 + Phase 5 wire-up section
│
└── docs/
    ├── architecture.md
    ├── api-spec.md
    ├── database-design.md            # §1.4 Q1-Q8 answered + storage estimates
    └── collaboration-design.md       # §4.8 Q1-Q8 answered (added 2026-05-19)
```

---

## Locked decisions — do not revisit without strong reason

| # | Decision | Why |
|---|---|---|
| D-002 | Docker **Hybrid** (infra-only + full + prod compose files) | Fast inner dev loop on host, portable demo, prod-ready |
| D-003 | **MinIO** for S3, not local FS | Tests presigned-URL flow without R2/AWS account |
| D-005 | **Tailwind v4** with `@tailwindcss/vite` | No postcss/autoprefixer chain |
| D-007 | Split `vite.config.ts` + `vitest.config.ts` | Vite 8 / Vitest 2 http-proxy type drift |
| D-008 | **Redis Streams** (not Apalis, not PG job table) | Already in stack for Pusher fallback / future use; native consumer groups + XPENDING for DLQ |
| D-011 | **`react-resizable-panels` v3** (not v4) | shadcn wrapper written against v3 API |
| D-013 | **5 stores** (project / ui / playback / history / collab) | Split by data *lifetime* — keeps RAF ticker from re-rendering history panel |
| Phase 6.6 | **Snapshot-based undo** (not Command pattern with inverse ops) | Local-only revert; deliberate trade — backend stays the post-op state, page reload re-syncs |

Full decision log in `DEV_LOG.md` (D-001 .. D-031). Read it before making
architecture choices.

---

## Critical gotchas — bugs we've already paid for

| Tag | The bug | Fix that worked |
|---|---|---|
| **G-007** | `fmtTC` float bug: `500ms / (1000/30)` → frame 14 not 15 | Integer math: `(ms * fps) / 1000` |
| **PUSHER-LOOP** | clip:updated echo → 25+ PATCHes/sec → ERR_INSUFFICIENT_RESOURCES | (a) check `payload.actor === authStore.user.id` not VITE_USER_ID; (b) `applyRemoteClipUpsert` skips API roundtrip |
| **FFMPEG-DEADLOCK** | Worker hangs after ffmpeg writes proxy — stderr pipe full | `tokio::spawn` drain stderr in parallel; never let pipe back-pressure block `child.wait()` |
| **HOOKS-ORDER** | EFFECTS tab click → black screen → "Rendered more hooks" | All Zustand selectors at top of component, BEFORE any early `return` |
| **STABLE-SELECTOR** | `selectEffectsForClip` returned new `[]` each call → infinite render | `Object.freeze([])` singleton as the empty fallback |
| **FLOAT-MS** | Drag clip → 422 from `/clips/:id` PATCH | `Math.round()` posMs/durMs before send (backend expects `i64`) |
| **VITE-ENVDIR** | `VITE_*` from root `.env` didn't load → Pusher disabled silently | `envDir: path.resolve(__dirname, '..')` in vite.config.ts |
| **TYPE-CAST** | sqlx Postgres enum → Rust `String` returns custom type | `SELECT col::text AS col` in query |
| **NUMERIC-DECODE** | `clips.speed NUMERIC(5,2)` → `f64` in Rust | `SELECT col::float8 AS col` (don't enable sqlx `decimal` feature unless needed) |
| **TMP-CLIP-ID** | Optimistic `c-tmp_*` ids must skip API PATCH | Every persist call: `if (id.startsWith('c-tmp')) return;` |
| **MOCK-LEAKAGE** | After hydrate, `MOCK_ASSET_INDEX[uuid]` is undefined | Look up via `useAssetsStore.byId[id]`, mock as fallback only |
| **TRACK-ID-DRIFT** | `clipAtTime` hard-coded `tr_v1/tr_v2` mock ids | Pass `tracks` argument, walk by array index (later = on top) |
| **WORKSPACE-LABEL** | `project.workspace` field is the workspace_id UUID, not name | Don't show it as a label; AssetBrowser hydration regex-checks it's a UUID before calling API |
| **SPLIT-MIN-DUR** | Split clip → 409 `clips_dur_ms_check violation` | Postgres CHECK is `dur_ms >= 400`. Frontend split guard + backend `split_clip` must use **400** (not 200) so both halves can pass the check |
| **SPLIT-ROLLBACK** | Failed split leaves orphan `c-tmp_*` clips in local state | `.catch()` calls `useProjectStore.getState().undoLocal()` to pop the snapshot pushed at split start |
| **SPLIT-NO-PEER-SYNC** | Window A splits, window B sees nothing | Backend publishes `clip:split` not `clip:updated`. CollabClient must bind `clip:split` and run both halves through `applyRemoteClipUpsert` |

When you see a familiar symptom, search this table first.

---

## Service inventory

| Service | Port | Where | Notes |
|---|---|---|---|
| Postgres 16 | 5432 | docker-compose | user/pass `cloudcut`/`cloudcut_dev`, db `cloudcut` |
| Redis 7 | 6379 | docker-compose | Streams: `cloudcut:assets`, `cloudcut:exports`; group `cloudcut-workers` |
| MinIO | 9000 (API), 9001 (console) | docker-compose | Bucket `cloudcut-assets`. **`/variants/*` is anonymous-readable, `/originals/*` is auth-only** |
| Backend (Axum) | 8080 | `cargo run -p backend` or `./target/debug/backend.exe` | `/api/v1/health` returns `{"status":"ok"}` |
| Worker | — | `cargo run -p worker` or `./target/debug/worker.exe` | Consumes `cloudcut:*` streams |
| Vite dev | 5173 | `cd frontend && pnpm dev` | Proxies `/api/*` → `:8080` |

Login: `alice@cloudcut.dev` / `password123` (also `mira@cloudcut.dev` / same).

---

## Commands cheat sheet

```powershell
# --- Infra ---
docker compose up -d postgres redis minio
docker compose ps                           # health check

# --- DB ---
docker exec cloudcut-postgres psql -U cloudcut -d cloudcut -c "\d"
docker exec -i cloudcut-postgres psql -U cloudcut -d cloudcut < backend/migrations/0001_init.sql

# --- Build / run ---
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
cargo build --workspace                     # ~3s incremental, ~1m clean
cargo build --workspace --bins              # only the binaries (skip docs)
cargo check --workspace                     # use when backend.exe is running (locked)
./target/debug/backend.exe                  # in foreground; logs to stderr
./target/debug/worker.exe

# --- Frontend ---
cd frontend
pnpm install
pnpm dev                                    # restart after .env changes!
pnpm typecheck                              # tsc -b --noEmit
pnpm test:run                               # 60 tests pass
pnpm build                                  # production bundle: ~400 KB JS / ~120 KB gzip

# --- Stop services ---
Get-Process -Name backend, worker -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Environment variables

`.env` lives at **repo root**. Both Rust (dotenvy) AND Vite (via `envDir: '..'`)
read from it. Don't create `frontend/.env`.

Backend reads: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`JWT_ACCESS_EXP_SECS`, `JWT_REFRESH_EXP_SECS`, `S3_ENDPOINT`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`,
`S3_PRESIGN_EXPIRES_SECS`, `BACKEND_HOST`, `BACKEND_PORT`,
`PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`.

Worker reads: `DATABASE_URL`, `REDIS_URL`, `S3_*`, `BACKEND_URL`,
`WORKER_CONCURRENCY`, `WORKER_POLL_MS`, `WORKER_MAX_RETRIES`.

Vite reads (prefix `VITE_`): `VITE_API_BASE`, `VITE_S3_PUBLIC_URL`,
`VITE_PUSHER_KEY`, `VITE_PUSHER_CLUSTER`, `VITE_USER_ID` (unused after
auth landed), `VITE_AUTH_TOKEN` (unused), `VITE_PUSHER_DEBUG`.

**Pusher is disabled silently when any of `PUSHER_APP_ID/KEY/SECRET` are
empty.** Backend logs `pusher disabled — set PUSHER_*` on startup;
frontend logs `[CollabClient] Pusher disabled — VITE_PUSHER_KEY missing`.

---

## Coding conventions

- **TypeScript strict.** No `any`, no `as` casts unless documented.
- **All hooks at the top of a function component.** Never call a hook after an
  early `return` or inside `if` — React will throw "Rendered more hooks"
  on the next render where the branch differs.
- **Zustand selectors must return stable references.** If the fallback path
  creates a new array/object, freeze a singleton and return that
  (`Object.freeze([])` is your friend).
- **Comments are for *why*, not *what*.** Never narrate code. Document
  trade-offs, gotchas, and reasons a future reader would need.
  > Bad: `// loop over clips`
  >
  > Good: `// Walk top-down so the highest layer wins on overlap`
- **No emojis unless explicitly requested** (we did keep some in DEV_LOG
  per user request).
- **Commit messages:** imperative, ~70-char subject, body explains *why*
  the change is needed. Always include `Co-Authored-By: Claude Opus 4.7
  <noreply@anthropic.com>` per the user's git policy.
- **Never push without asking.** User policy: ทำหลายๆครั้งค่อยถามว่าจะ push
  ไหม. Default is *don't push*.

---

## How the parts talk to each other

```
Browser
  │
  │ HTTP (proxied through Vite :5173 → backend :8080 in dev)
  ▼
Backend (Axum)
  │
  ├──→ Postgres (sqlx)              source of truth for project / clips / users
  ├──→ Redis (XADD)                 asset processing + export jobs
  ├──→ Pusher REST (HMAC-SHA256)    real-time fan-out
  └──→ MinIO (presigned PUT URL)    client uploads directly, backend never sees bytes
       ▲
       │
Worker (Rust + tokio + ffmpeg)
  │
  ├←── Redis XREADGROUP              consume cloudcut:assets / cloudcut:exports
  ├──→ MinIO download original        ↓
  ├──→ spawn ffmpeg CLI               probe / proxy / thumbnail / waveform / export
  ├──→ MinIO upload variants          /variants/{asset_id}/*.{mp4,jpg,json}
  └──→ Postgres UPDATE                assets.status='ready', assets.progress_pct=100
       ↑
       │
Browser (poll every 3s while anything is processing)
```

Realtime: backend `publish_project_event()` → Pusher `presence-project-{id}`
channel → all subscribed browsers receive → `CollabClient` applies via
`applyRemoteClipUpsert` (no API roundtrip — that was the loop bug).

---

## Current state (as of 2026-05-19 evening)

### Definition-of-Done scoreboard (from spec)

| # | DoD | Status |
|---|---|:---:|
| 1 | Open frontend | ✅ `http://localhost:5173` |
| 2 | Login | ✅ Real Argon2id + JWT + refresh on 401 |
| 3 | Open project | ✅ Hydrates from API; mock fallback only on infra outage |
| 4 | Timeline shows tracks + clips | ✅ Real data from `/projects/:id/timeline` |
| 5 | Drag / trim / split | ✅ All persist to backend; reload-stable |
| 6 | Upload asset → backend job | ✅ Presigned PUT → XADD `cloudcut:assets` |
| 7 | Worker runs real ffmpeg | ✅ probe/proxy/thumbnail/waveform pipelines, all output verified in MinIO |
| 8 | Basic export | ✅ Tested end-to-end; outputs to `/exports/{project}/{job}/output.{mp4,webm,mov}` |
| 9 | Pusher presence + op sync | ✅ Two-window test passes after PUSHER-LOOP fix |
| 10 | Tests pass | ✅ 60 Vitest + 3 cargo |
| 11 | README + DESIGN.md present | ✅ |

### DESIGN.md questions answered

| Spec section | File | Status |
|---|---|:---:|
| §1.4 (8 Q) | `docs/database-design.md` | ✅ |
| §2.7 (9 Q) | `backend/DESIGN.md` | ✅ |
| §3.13 (8 Q) | `worker/DESIGN.md` | ✅ |
| §4.8 (8 Q) | `docs/collaboration-design.md` | ✅ (added 2026-05-19) |
| §5.10 (7 Q) | `frontend/DESIGN.md` | ✅ |

### Punch list — known gaps

**Critical (planned next sessions):**
- [ ] Workspaces endpoints: POST /workspaces, /:id/invite, PATCH/DELETE /members/:userId
- [ ] Role-based authorization matrix (§2.6) — currently only `is_workspace_member` check, no owner/admin/editor/viewer distinction
- [ ] `GET /api/v1/projects/:id/operations?afterSeq=X` for offline reconnect
- [ ] OpenAPI wiring via `utoipa-swagger-ui` (deps already in Cargo.toml)
- [ ] Rate limiting per §3.10 (free=5/hr, pro=50/hr, team=200/hr uploads)

**Medium:**
- [ ] POST /projects/:id/duplicate
- [ ] GET/POST /projects/:id/versions
- [ ] Transitions endpoints
- [ ] Text overlay endpoints + rendering
- [ ] POST /clips/batch
- [ ] PATCH /effects/reorder
- [ ] DELETE /exports/:id (cancel running export)
- [ ] Idempotency_key actually enforced on export creation (column exists, unused)
- [ ] Scheduled cleanup job (§3.12)
- [ ] Demo video / screenshots (Rule 14)

**Cosmetic:**
- Seed clip `00000000-0000-0000-0000-000000000050` was hand-relinked to
  `smoke.mp4` asset during recovery (originally pointed at `hero_shot.mp4`
  mock asset row). Inspector shows the actual link. Delete + recreate
  the clip to clean up.
- Selection (`selectedClipIds`) initial value is `['c2']` mock id —
  harmless (just nothing selected on load).

### Recent commits (last 20, branch `dev`)

Run `git log --oneline -20` to see live. Key landmarks:
- `dae4a84` Phase 5 — Pusher
- `78b3833` Phase 4 — Worker
- `cc1209a` Phase 3 — Axum API
- `6771681` Phase 6.1+6.2 — auth + real project hydration
- `545b332` real video + real ffmpeg progress + drop CollabSimulator
- `cbc3a06` worker ffmpeg stderr deadlock fix
- `bd5a9f7` Pusher echo-loop fix (the big one)

---

## Quick session bootstrap

When you start fresh:

1. Read this file. (You're already doing it.)
2. `git log --oneline -10` to see what just landed.
3. Check if services are up: `tasklist | grep -E "^backend|^worker"` +
   `docker ps`. If not, follow Commands cheat sheet.
4. Read `DEV_LOG.md` *only if* you need pre-Phase-5 historical context.
5. The specific DESIGN.md for the area you're touching.
6. Then start coding.

Don't:
- Recreate `CollabSimulator` — it's deliberately deleted.
- Add `frontend/.env` — use root `.env` via `envDir`.
- Call user-facing `moveClip()` from Pusher event handlers — use
  `applyRemoteClipUpsert()`.
- Use `sqlx::query!` macros — we use runtime `sqlx::query()` to keep
  `cargo build` working without a live DB.

---

## Reference docs (in this repo)

- `README.md` — setup steps for a fresh clone
- `DEV_LOG.md` — full project history + decision table
- `backend/DESIGN.md` — §2.7 API design rationale
- `worker/DESIGN.md` — §3.13 queue + ffmpeg rationale
- `frontend/DESIGN.md` — §5.10 React + Zustand + timeline rationale
- `docs/database-design.md` — §1.4 schema + storage estimates
- `docs/collaboration-design.md` — §4.8 Pusher + CRDT discussion
- `C:\Users\Cobalt\Desktop\cloudcut-mid-test.md` — original test brief (outside repo)
