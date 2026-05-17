# DEV_LOG — CloudCut

> บันทึกการพัฒนา CloudCut ทีละ phase พร้อมเหตุผลของ decisions สำคัญ
> และอุปสรรคที่เจอระหว่างทาง

**Format:** เรียงตามวันที่จากเก่าไปใหม่ แต่ละ phase มีโครงสร้าง:
1. **Goal** — เป้าหมายของ phase
2. **What was done** — สิ่งที่ทำจริง
3. **Decisions** — choices ที่ตัดสินใจ พร้อมเหตุผล
4. **Verification** — วิธี confirm ว่าทำงานได้
5. **Gotchas** — ปัญหาที่เจอ + วิธีแก้

---

## 📅 Timeline overview

| Date | Phase | Scope | Status |
|------|------:|-------|:------:|
| 2026-05-17 | 0 | Monorepo + Docker scaffold | ✅ |
| 2026-05-17 | 1.1 | Frontend foundation (Vite + TS strict + Tailwind + shadcn) | ✅ |
| 2026-05-17 | 1.2 | Design tokens + app shell layout | ✅ |
| 2026-05-17 | 1.3 | Zustand stores + types + mock data | ✅ |
| 2026-05-17 | 1.4 | TopBar + AssetBrowser | ✅ |
| 2026-05-17 | 1.5 | VideoPlayer + InspectorPanel | ✅ |
| 2026-05-18 | 1.6 | Timeline (tracks, clips, ruler, playhead, snap) | ✅ |
| 2026-05-18 | 1.7 | Overlays + Collab simulator + shortcuts | ✅ |
| 2026-05-18 | 1.8 | Vitest + tests + frontend/DESIGN.md | ✅ |
| 2026-05-18 | 2 | Database schema + migrations + seed | ✅ |
| — | 3 | Backend API (Axum + auth) | ⏳ |
| — | 4 | Worker + ffmpeg pipelines | ⏳ |
| — | 5 | Pusher collaboration | ⏳ |

---

## 🎯 Key decisions (locked unless revisited)

| # | Decision | เหตุผล |
|---|----------|--------|
| **D-001** | Cargo **workspace** (backend + worker share deps) | ลด duplicate deps, share build cache, refactor cross-crate ง่าย |
| **D-002** | Docker **Hybrid** strategy (`docker-compose.yml` infra + `full.yml` + `prod.yml`) | dev เร็ว (Rust/frontend บน host) แต่ portable demo + production-ready |
| **D-003** | **MinIO** เป็น S3 storage layer (ไม่ใช่ local filesystem) | ทดสอบ presigned URL flow ได้สมจริงโดยไม่ต้อง R2/AWS account |
| **D-004** | **pnpm** package manager | spec กำหนด + lockfile deterministic + disk-efficient |
| **D-005** | **Tailwind v4** (ไม่ใช่ v3) | `@tailwindcss/vite` plugin ใหม่ — ไม่ต้อง postcss + autoprefixer, theme เป็น CSS-first |
| **D-006** | shadcn style **"new-york"** | density สูงเหมาะกับ pro video editor (ใกล้เคียงกับ prototype) |
| **D-007** | แยก `vite.config.ts` + `vitest.config.ts` | เลี่ยง http-proxy type drift ระหว่าง Vite 8 และ Vitest 2 |
| **D-008** | Redis **Streams** (Phase 4) แทน Apalis / PG job table | match กับ spec, control retry/dead-letter เอง, scale horizontally ง่าย |
| **D-009** | เก็บ original prototype ที่ `docs/prototype/` | reference สำหรับ port pixel-perfect โดยไม่ปนกับ production code |
| **D-010** | Two-layer CSS variables (functional → shadcn semantic) | editor ใช้ `--bg-1/--text-2` ตรง ๆ ได้, shadcn ใช้ `--background/--foreground` — เปลี่ยน accent ตัวเดียวกระทบทั้งสอง layer |
| **D-011** | `react-resizable-panels` **v3** (ไม่ใช่ v4) | shadcn wrapper เขียน against v3 API — v4 rename `PanelGroup → Group`, `PanelResizeHandle → Separator` |
| **D-012** | Theme toggle เก็บ `localStorage['cloudcut:theme']` + fall-back `prefers-color-scheme` | persist ข้าม reload, respect OS preference ตอน first visit |
| **D-013** | แยก **5 stores** (project / ui / playback / history / collab) — เกินขั้นต่ำ 3 ของ spec | spec บอก "อย่างน้อย 3" — แยกตาม **lifetime ของ data** (server-owned / session / animation / undo log / event-driven) ไม่ใช่ตาม feature ลดการ re-render ข้ามขอบเขต |
| **D-014** | Plain `create()` ไม่ใช้ middleware (immer/devtools/subscribeWithSelector) ตอนนี้ | mutations ปัจจุบันยังไม่ซับซ้อนพอ — `set((s) => ({ ... }))` ยังอ่านง่ายอยู่ Phase 1.5 ค่อยพิจารณา immer ถ้า nested effects mutations เริ่มเลอะเทอะ |
| **D-015** | Mock data เป็น `readonly` + `as const` ทุกที่ + ใช้ `clip()` factory ตั้ง defaults | กัน accidental mutation ของ fixture, type narrowing ดีกว่า, swap เป็น API response ใน Phase 3 ง่าย (signature เหมือนกัน) |
| **D-016** | Custom keyframes ผ่าน `@theme` ของ Tailwind v4 (`--animate-cc-*`) ไม่เขียน utility class แยก | ผูก keyframe + duration + easing ในที่เดียว, ใช้ผ่าน `style={{ animation: 'var(--animate-cc-presence-pulse)' }}` แทนการ register Tailwind plugin |
| **D-017** | Asset drag-to-timeline ส่งข้อมูลผ่าน `dataTransfer` type `application/x-cloudcut-asset` (เก็บ assetId) | ใช้ HTML5 native drag — ไม่ต้อง react-dnd library, payload = asset id เป็น string พอ Timeline (Phase 1.6) เป็นคนสร้าง clip จาก id |
| **D-018** | RAF ticker เป็น hook `usePlaybackTicker()` mount ใน `<VideoPlayer />` ตัวเดียว ใช้ `useStore.getState()` ภายใน loop (ไม่ใช่ React selector) | กัน effect re-run ทุก frame, store mutation ผ่าน `setState` ตรง ๆ React ขยับเฉพาะ subscribers ของ `currentTimeMs` |
| **D-019** | V2 (B-Roll) wins V1 ตอน composite ใน `clipAtTime()` | match prototype rule, future enhancement: per-track blend modes ใน Phase 2-3 |
| **D-020** | CSS filter เป็น single string ที่ apply บน stage wrapper (ไม่ใช่ filter chain ผ่าน multiple divs) | สั้นกว่า, transition `filter 0.15s` ทำได้ทีเดียว, GPU-composite ดี |
| **D-021** | Transform sliders ใน PropsTab เป็น **uncontrolled** (รับ `init` แทน `value`) จนกว่าจะมี `updateClipTransform()` action | จะแก้ผ่าน Phase 1.6+ (เมื่อ canvas drag จริงเริ่มต้อง mutate transform) — ตอนนี้ไม่ใช้ action เปล่า ๆ ก็ไม่ต้อง infra เพิ่ม |
| **D-022** | Timeline เป็น **DOM-based** (ไม่ใช่ Canvas) — แต่ละ clip คือ `<div>` absolute positioned, waveform เป็น `<svg path>` | Demo project มี ~12 clips — DOM render ภายใน 16ms/frame ได้สบาย. ถ้า Phase 1.8 profiling เห็น cost >16ms ที่ 1000+ clips, virtualize เฉพาะ rows ที่อยู่ใน viewport (`react-virtual` หรือ hand-rolled). ใส่เป็น hot-swap path ใน DESIGN.md Q1 |
| **D-023** | Drag handler **inline ใน Timeline.tsx** (ไม่แยกเป็น `useClipDrag`) | hook ต้อง expose `setSnapLineX` setter ออกมา — เพิ่ม coupling ที่ไม่ได้ทำให้คนอ่านดีขึ้น. inline ภายใน Timeline กิน 50 บรรทัด, dependency ครบใน scope เดียว |
| **D-024** | Trim handle ใช้ **action `resizeClip(id, posMs, durMs)` ตัวเดียว** สำหรับทั้ง left + right | left trim ต้องขยับ posMs + durMs พร้อมกัน (pin right edge). action เดียวคุม atomic, history entry 1 entry แทน 2 |
| **D-025** | Asset drop target รับเฉพาะ `application/x-cloudcut-asset` MIME + คุม **type compatibility** (audio → audio track only) | กัน user ลาก image ใส่ audio track หรือ external file (browser bug). drop logic อยู่ใน Timeline.tsx ตรงข้าม dragstart ใน AssetRow |
| **D-026** | Keyboard shortcuts hook อ่าน store ผ่าน `useStore.getState()` ภายใน listener (ไม่ใช่ React selectors) | listener register ครั้งเดียวตลอด App lifetime; selectors จะทำให้ effect re-run และ re-bind listener ทุก state change |
| **D-027** | Overlays (Shortcuts, EffectsBrowser, HistoryPanel, ToastStack) ใช้ **`position: fixed` ตรง ๆ** (ไม่ใช้ Portal) | React 19 + Tailwind v4 ไม่มี z-index issue ภายใน scope ของเรา (resizable handles z-5, overlays z-50+) — Portal เพิ่ม complexity โดยไม่ได้ประโยชน์ |
| **D-028** | CollabSimulator return `null` (เป็น "headless component") + driver ใน `useEffect` | mount/unmount ตาม `<CollabSimulator />` ใน App tree — `showPresence === false` ทำให้ cleanup loop ทันที, ไม่ต้อง imperative subscribe/unsubscribe API |
| **D-029** | ViewportCursors mount ภายใน `<VideoPlayer>` (ไม่ใช่ใน App.tsx) | cursor (x, y) เป็น ratio 0-1 ของ container; placement ใน Player ทำให้ ratio resolve ตาม player viewport ตรง ๆ (resize panel ก็ยัง correct) |
| **D-030** | Tests **colocated** ใน `src/` (เช่น `src/utils/timecode.test.ts`) ไม่ใช่ `frontend/tests/` ตามที่ brief แนะนำ | brief structure เป็น suggestion ไม่ใช่ requirement. colocated เลี่ยง tsconfig path เพิ่ม, refactor พร้อมกับ source ง่าย, IDE navigation ระหว่าง code ↔ test ดีกว่า |
| **D-031** | Undo/redo **เป็น "log of events" (ไม่ใช่ Command pattern เต็มรูปแบบ)** ใน Phase 1 | ทุก mutation pure shape-shift, recorded inverse op จะเป็น boilerplate. Phase 5 (Pusher) จะเปลี่ยนเป็น `applyOperation(op)` ที่ record inverse op พร้อมกัน — local undo + remote conflict resolution ใช้ mechanism เดียวกัน |

---

## 📦 Phase 0 — Monorepo + Docker scaffold

**Date:** 2026-05-17 · **Status:** ✅

### Goal
ตั้งโครงสร้าง monorepo + Docker compose ที่ครอบคลุม Postgres + Redis + MinIO,
placeholder ให้ `cargo run -p backend/worker` ผ่านตามกฎ #2, #3

### What was done
- สร้าง Cargo workspace root + 2 members (`backend/`, `worker/`)
- Docker Compose **3 ไฟล์**:
  - `docker-compose.yml` — infra only (default สำหรับ dev)
  - `docker-compose.full.yml` — เพิ่ม backend/worker (+ frontend หลัง Phase 1.1)
  - `docker-compose.prod.yml` — multi-stage release builds
- Dockerfile **multi-stage** (rust:1.83-slim → debian:bookworm-slim) — final image ~80-120MB
- `Dockerfile.dev` ใช้ `cargo-watch` hot reload + `sqlx-cli`
- Worker image bundle ffmpeg (Rule #6)
- MinIO bootstrap script idempotent (`docker/minio/setup.sh`)
- Postgres init.sql ติดตั้ง `pgcrypto`, `uuid-ossp`, `citext`
- ย้าย prototype HTML/JSX เดิมไป `docs/prototype/` ตาม D-009
- `.env.example` / `.gitignore` / `.dockerignore` / `README.md` ครบ
- DESIGN.md skeleton ที่ backend/ + worker/

### Verification
```bash
docker compose up -d
docker compose ps    # → ทั้ง 3 service healthy
```

| Service | Smoke test | Result |
|---------|------------|:------:|
| Postgres | `psql -c "SELECT extname FROM pg_extension"` | citext, pgcrypto, uuid-ossp พร้อม ✓ |
| Redis | `redis-cli PING` | `PONG` ✓ |
| MinIO | `mc ls local/` | bucket `cloudcut-assets` สร้างโดย `minio-setup` ✓ |

### Rules unlocked
- ✅ #1 workspace compile ได้ (`cargo build`)
- ✅ #2, #3 placeholder run ได้
- ✅ #11 README.md
- ✅ #13 `.env.example`

---

## 🎨 Phase 1.1 — Frontend foundation

**Date:** 2026-05-17 · **Status:** ✅

### Goal
ตั้ง Vite + React 19 + TS strict + Tailwind v4 + shadcn ใน `frontend/`,
`pnpm dev` รันได้ที่ http://localhost:5173

### What was done
- Scaffold ด้วย `npm create vite@latest frontend -- --template react-ts` (React 19.2.6)
- ปรับ `package.json` → ชื่อโปรเจค `cloudcut-frontend`, เพิ่ม deps:
  - **Tailwind v4** + `@tailwindcss/vite`
  - **Zustand** v5
  - **shadcn deps** — `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@radix-ui/react-slot`, `tw-animate-css`
  - **Vitest** + `@testing-library/react` + `jsdom` + `@testing-library/jest-dom`
- TS strict ใน `tsconfig.app.json` — `strict: true` พร้อม helper flags (noImplicitAny, strictNullChecks, ...)
- Path alias `@/*` → `src/*` (matches shadcn convention)
- `components.json` config style="new-york"
- `src/lib/utils.ts` — `cn()` helper สำหรับ shadcn components
- `src/index.css` — Tailwind v4 import + shadcn CSS variables (dark/light)
- ลบ default Vite assets (logo, App.css, ฯลฯ)
- สร้าง folder skeleton: `components/{ui,layout,topbar,timeline,player,inspector,assets,collaboration,shared}`, `state/`, `hooks/`, `services/`, `utils/`, `types/`, `mocks/`
- `frontend/Dockerfile` (prod, nginx) + `Dockerfile.dev` (Vite HMR)
- Uncomment frontend service ใน `docker-compose.full.yml`
- `frontend/DESIGN.md` skeleton ตอบ 7 คำถามใน 5.10 (จะเติม Phase 1.8)
- `.npmrc` กับ `dangerously-allow-all-builds=true` + `shamefully-hoist=true`

### Decisions
- **D-005, D-006, D-007** locked here (Tailwind v4, shadcn "new-york", split vite/vitest configs)
- **`shamefully-hoist=true`** ใน `.npmrc` — Vite + Tailwind v4 ต้องการ flat node_modules
  เพื่อให้ bind mount + anonymous volume ใน Docker dev ทำงาน

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` (TS strict) | ✅ 0 errors |
| `pnpm build` (Vite production) | ✅ 212 KB JS / 67 KB gzipped, 327ms |
| `pnpm dev` smoke test | ✅ HTTP 200 ที่ http://localhost:5173 |

### Rules unlocked
- ✅ #7 TypeScript strict
- ✅ #8 shadcn/ui foundation พร้อม

### Gotchas

#### G-001 — pnpm ติดตั้งไม่ได้ (EPERM)
**สาเหตุ:** Node อยู่ใน `C:\Program Files\nodejs` → `corepack enable` ต้อง Admin
**แก้:** `npm install -g pnpm --location=user` ติดตั้งไป `%APPDATA%\npm` (ไม่ต้อง Admin)

#### G-002 — pnpm 11 block esbuild build scripts
**สาเหตุ:** pnpm 11 มี gate `ERR_PNPM_IGNORED_BUILDS` ป้องกัน install scripts รันโดยไม่ approve
**ลองแล้วไม่ได้:** `pnpm.onlyBuiltDependencies` ใน package.json, `NPM_CONFIG_STRICT_DEP_BUILDS=false`, `dangerously-allow-all-builds=true` ใน `.npmrc` (ตัวแรกเดียว) — สถานะติด lockfile
**แก้:** รัน `pnpm approve-builds esbuild` ครั้งเดียวให้ install script ทำงาน + เก็บ `.npmrc` flag ไว้กัน CI break ในอนาคต

#### G-003 — TS 6 deprecate `baseUrl`
**Error:** `tsconfig.app.json(19,5): error TS5101: Option 'baseUrl' is deprecated`
**แก้:** ลบ `baseUrl` ออก เก็บแค่ `paths` (TS 6 resolve paths สัมพันธ์กับ tsconfig location เอง)

#### G-004 — Vite 8 ↔ Vitest 2 type drift
**Error:** `defineConfig` จาก `vitest/config` ขัดกับ Vite 8 server.proxy types (http-proxy)
**แก้:** แยก `vite.config.ts` (Vite-only) + `vitest.config.ts` (ใช้ `mergeConfig` สืบ alias/plugins มา)

---

## 🎨 Phase 1.2 — Design tokens + app shell layout

**Date:** 2026-05-17 · **Status:** ✅

### Goal
Port CloudCut palette ทั้งหมดจาก `docs/prototype/src/styles.css` เข้า Tailwind v4
theme, สร้าง editor shell (48px topbar + resizable horizontal/vertical panels),
dark/light mode toggle ใช้งานได้

### What was done
- Rewrite `src/index.css` ด้วยโครงสร้าง **4 layers**:
  1. Functional palette (`--bg-0`…`--bg-4`, `--text-1`…`--text-4`, `--clip-v-1/v-2`, `--clip-a-1/a-2`, `--row-h: 60px`, `--ruler-h: 28px`, `--header-w: 168px`) — ผูกกับ `[data-theme="light|dark"]`
  2. shadcn semantic mapping (`--background → var(--bg-0)`, `--accent-foreground → var(--accent-ink)`, ฯลฯ)
  3. `@theme inline` block — expose CSS vars เป็น Tailwind utilities (`bg-surface-1`, `text-text-3`, `bg-clip-v-1`, `border-line-soft`)
  4. Element baselines (Geist font, body bg, overflow hidden, `.font-mono` utility)
- shadcn `resizable` component ที่ `src/components/ui/resizable.tsx` (manual port, audit-friendly)
- `useTheme` hook (`src/hooks/useTheme.ts`) — toggle `<html data-theme>`, persist localStorage, respect `prefers-color-scheme`
- Shared components:
  - `PanelHead` — 36px uppercase strip (matches `.panel-head` rule)
  - `PanelPlaceholder` — empty-state filler for un-ported panels
- 5 placeholder panels: `TopBar` (มี brand + project crumb + theme toggle ใช้ได้จริง), `AssetBrowser`, `VideoPlayer`, `InspectorPanel`, `Timeline` (icons + phase label)
- `EditorLayout` — `ResizablePanelGroup` nested:
  - vertical outer: upper (62%) / timeline (38%)
  - horizontal inner: assets (20%) / player (55%) / inspector (25%)
  - `autoSaveId="cloudcut:editor:v1"` → persist panel ratios ใน localStorage
- `App.tsx` mount `<EditorLayout />` แทน placeholder เดิม

### Decisions
- **D-010** Two-layer CSS variables — แยก functional/semantic ชัดเจน
- **D-011** Pin `react-resizable-panels` v3 (G-005 explains why)
- **D-012** Theme toggle persistence strategy

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` (TS strict) | ✅ 0 errors |
| `pnpm build` | ✅ 249 KB JS / 79 KB gzipped, 325ms |
| `pnpm dev` smoke test | ✅ HTTP 200 |
| Theme toggle (Sun/Moon icon ใน TopBar) | คลิกสลับ dark/light ได้ทันที, persist หลัง reload |
| Resize panels (drag handles) | ลากซ้าย-ขวา ขึ้น-ลงได้, ratio บันทึก localStorage |

### Gotchas

#### G-005 — `react-resizable-panels` v4 ทำลาย shadcn wrapper
**สาเหตุ:** `pnpm add` ติดตั้ง v4 (latest) แต่ shadcn ออกแบบ wrapper against v3 API ซึ่ง v4 rename ออกหมด: `PanelGroup → Group`, `PanelResizeHandle → Separator`, prop `direction → orientation`
**Errors:** `TS2339: Property 'PanelGroup' does not exist`
**แก้:** `pnpm add react-resizable-panels@^3` pin ที่ major 3 (3.0.6) จนกว่า shadcn จะอัปเดต wrapper

#### G-006 — หน้า browser ว่างหลัง downgrade เพราะ Vite cache ค้าง v4
**สาเหตุ:** TS/build ผ่านหมด แต่ browser โหลด bundled dep เก่า (v4) จาก `node_modules/.vite/deps/` — Vite ไม่ re-bundle อัตโนมัติเมื่อ version ของ dependency เปลี่ยน (เฉพาะตอน package.json/lockfile mtime ต่าง)
**Symptom:** runtime error `The requested module does not provide an export named 'PanelGroup'` + page render blank
**แก้:** `rm -rf node_modules/.vite && pnpm dev --force` (flag `--force` บอก Vite ให้ re-optimize deps จาก scratch) + hard refresh browser
**Lesson:** ทุกครั้งที่ downgrade major version ของ npm dep ต้อง force Vite re-optimize

---

## 🧠 Phase 1.3 — Zustand stores + types + mock data

**Date:** 2026-05-17 · **Status:** ✅

### Goal
สร้าง type system + Zustand stores + utilities + mock fixture ครอบคลุม
project/timeline/playback/history/collab — เป็นรากของ Phase 1.4–1.8

### What was done
- `src/types/index.ts` — 18 types (Project, Track, Clip, ClipEffect, Asset, Collaborator, CursorState, HistoryEntry, Toast, + UI enums) ทั้งหมด `readonly` + branded `UUID = string`
- `src/utils/timecode.ts` — `fmtTC`, `fmtClipDur`, `pickRulerStep`, `fmtRulerTick` (pure functions, ready for Vitest)
- `src/utils/geometry.ts` — `pxPerSec / pxPerMs / msToPx / pxToMs / clipBox / snap()` ผูกรวมคณิตศาสตร์ timeline ไว้ที่เดียว (จะใช้ใน Phase 1.6)
- `src/utils/id.ts` — `uid(prefix)` สำหรับ mock; production จะใช้ UUIDv7 จาก backend
- `src/mocks/cloudcut.ts` — port Q4 Product Demo fixture ทั้งหมด (1 project, 4 tracks, 12 clips, 6 effects, 16 assets, 3 collaborators, 6 history entries)
- **5 Zustand stores:**
  - `projectStore` — server-owned + 10 actions (toggleTrack, moveClip, trimClip, splitClipAt, deleteClips, addEffect, toggleEffect, updateEffect, removeEffect, loadMockProject) + 3 selectors
  - `uiStore` — session UI state (selection, tools, zoom, snap, tabs, tweaks surfaces, theme, overlays) + 18 actions
  - `playbackStore` — transport (current/playing/speed/volume/muted)
  - `historyStore` — undo/redo + toast stack
  - `collabStore` — collaborators + cursors (driven by simulator ใน Phase 1.7)
- `useTheme` refactor → delegate ไป `uiStore.theme` (Phase 1.2 API คงเดิม, ownership ย้าย)
- TopBar consume: `useProjectStore` (project name, workspace, fps, resolution, totalDuration), `useHistoryStore` (canUndo/canRedo + actions), `useUIStore` (theme toggle, shortcuts toggle)
- App.tsx → `useEffect(() => loadMockProject())` ตอน mount

### Decisions
- **D-013, D-014, D-015** locked here

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` (TS strict, 5 new stores, 18 types) | ✅ 0 errors |
| `pnpm build` | ✅ 261 KB JS / 83 KB gzipped (+12 KB raw / +4 KB gzipped จาก Phase 1.2) |
| TopBar แสดงข้อมูลจาก store จริง (project name, workspace, stats) | ✅ |
| Undo/Redo ใน TopBar disable/enable ตาม history cursor | ✅ |
| Theme toggle ทำงานผ่าน uiStore แทน hook-local state | ✅ |

### DESIGN.md updates
- `frontend/DESIGN.md` Q2 (state split) — ตอบเต็มแล้ว พร้อม store-by-store breakdown
- Phase progress table — mark Phase 1.3 ✅

### Gotchas
*(ไม่มี — store types stable, build ผ่านครั้งแรก ไม่มี TS regressions)*

---

## 🎬 Phase 1.4 — TopBar (full) + AssetBrowser

**Date:** 2026-05-17 · **Status:** ✅

### Goal
เติม presence avatars + history toggle ใน TopBar, port AssetBrowser ฉบับเต็ม (tabs, search, status-grouped list) ใช้ store ที่สร้างจาก Phase 1.3 จริง ๆ

### What was done
- `index.css` — เพิ่ม `@keyframes cc-presence-pulse` + `cc-spinner` register เป็น Tailwind v4 `--animate-cc-*` token (ดู D-016)
- **TopBar เติม:**
  - `Presence.tsx` — stacked avatars จาก `collabStore`, ring pulse ตอน collaborator มี `editingClipId`, "You" avatar ขอบ accent
  - History toggle button (HistoryIcon) wire กับ `uiStore.toggleHistoryPanel` + active state
  - Presence section toggle ตาม `uiStore.showPresence`
- **AssetBrowser ฉบับเต็ม** (`assets/AssetBrowser.tsx`):
  - 4 tabs (All/Video/Audio/Image) + count chips จาก `MOCK_ASSETS` (memoized)
  - Live search input — filter assets ตาม name (case-insensitive)
  - Upload button (visual placeholder, Phase 3 wire)
  - List sectioned: "In progress" (uploading/processing) → "Ready"
  - Empty state เมื่อ search ไม่เจอ
- **3 sub-components ใหม่:**
  - `AssetThumb.tsx` — 56×36 thumbnail ตามชนิด asset (video gradient / audio gradient + music icon / image)
  - `AssetStatusPill.tsx` — pill 4 states (ready ✓ / processing spin / uploading spin / failed)
  - `AssetRow.tsx` — full row + drag handle (HTML5 native, payload `application/x-cloudcut-asset`)

### Decisions
- **D-016** custom keyframes ผ่าน Tailwind `@theme` (เลี่ยง plugin)
- **D-017** HTML5 native drag (ไม่ใช้ react-dnd)

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ 270 KB JS / 85 KB gzipped (+9 KB raw จาก Phase 1.3) |
| Presence avatars (Alice/Mira/Devon/YU) แสดงใน TopBar | ✅ |
| Mira avatar มี ring pulse (จาก `editingClipId: c6` ใน mock) | ✅ |
| History button toggle ได้ active state | ✅ |
| Tabs filter assets ตาม type | ✅ |
| Search filter ทำงาน live + empty state | ✅ |
| Asset row drag handle (cursor changes + ghost) | ✅ |
| Upload + filter button (visual, ไม่ขึ้น error) | ✅ |

### DESIGN.md updates
- เติม `frontend/DESIGN.md` Phase progress: 1.4 ✅

### Gotchas
*(ไม่มี — components compose cleanly, ไม่ต้องแก้ store/types ใด ๆ)*

---

## 🎥 Phase 1.5 — VideoPlayer + InspectorPanel

**Date:** 2026-05-17 · **Status:** ✅

### Goal
VideoPlayer ฉบับเต็ม (mock frames, transport, RAF ticker, CSS filter preview) + InspectorPanel (Properties tab, Effects tab) — effects ปรับใน Inspector มี feedback ทันทีบน player stage

### What was done
- **`utils/playback.ts`** — `clipAtTime()` (V2 overrides V1) + `filterFromEffects()` (default identity, brightness uses 1+value mapping)
- **`hooks/usePlaybackTicker.ts`** — RAF loop, reads via `useStore.getState()` (avoids effect re-runs/frame), auto-pause + loop-to-0 ที่ project end
- **Player (5 ไฟล์):**
  - `MockFrame.tsx` — 5 บรรท clip composition (intro/logo, browser chrome, outro CTA, ui closeup, default)
  - `SpeedPicker.tsx` — pill dropdown 0.25/0.5/1/1.5/2× + outside-click + Esc dismiss
  - `PlayerControls.tsx` — 44px transport bar (TC display / 5 transport btns / volume slider+gradient fill / SpeedPicker)
  - `VideoPlayer.tsx` — 16:9 stage + overlays (TC top-left, res/fps top-right, dashed safe area)
- **Inspector (5 ไฟล์):**
  - `SliderRow.tsx` — reusable [label|slider|value] (รองรับทั้ง controlled + uncontrolled)
  - `EffectCard.tsx` — toggle (custom switch) + slider + trash, bind ตรง projectStore
  - `PropsTab.tsx` — Clip (name, source, track, position, duration, in, out) + Transform (X/Y/Scale/Rotation/Opacity)
  - `EffectsTab.tsx` — list of EffectCard + Add menu (4 effect types, disable เมื่อ added) + live CSS readout
  - `InspectorPanel.tsx` — 3 state (none/multi/single) + tabs (Properties/Effects/Audio disabled)
- `index.css` — เพิ่ม `cc-insp-slider` + `cc-volume` thumb styling (webkit + moz)

### Decisions
- **D-018** RAF ticker hook + `getState()` ใน loop
- **D-019** V2 overrides V1 (จาก prototype)
- **D-020** CSS filter เป็น single string บน stage wrapper
- **D-021** Transform sliders uncontrolled จนกว่าจะมี action

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` (TS strict) | ✅ 0 errors |
| `pnpm build` | ✅ 291 KB JS / 90 KB gzipped (+21 KB raw จาก Phase 1.4) |
| Player stage แสดง mock frame ตาม clip ที่อยู่ใน playhead | ✅ |
| Play button → RAF ticker เดิน, TC + frame เปลี่ยนตามเวลา | ✅ |
| ปรับ Brightness/Contrast slider ใน Inspector → stage เปลี่ยนสีทันที | ✅ |
| Toggle effect off → preview กลับ identity, CSS readout sync | ✅ |
| Add effect → จาก dropdown → ปุ่มของ effect type นั้น disable | ✅ |
| Inspector empty state (deselect all) | ✅ |
| Volume slider gradient fill + mute toggle | ✅ |
| Speed picker dropdown (outside click + Esc) | ✅ |

### DESIGN.md updates
- `frontend/DESIGN.md` Phase progress: 1.5 ✅ (no §5.10 question fully answered yet — Q1 DOM/Canvas decision ยังอยู่ Phase 1.6)

### Gotchas
*(ไม่มี — type system จาก Phase 1.3 catch ทุก mismatch, store API คงตัว)*

---

## 🎞️ Phase 1.6 — Timeline editor

**Date:** 2026-05-18 · **Status:** ✅

### Goal
Timeline ฉบับเต็ม — track headers + adaptive ruler + clips ที่มี thumbnail/waveform + drag+snap + blade tool + trim handles + asset drop target + remote collab cursors

### What was done
- **`utils/waveform.ts`** — deterministic SVG path generator (hash → sin-based pseudo-random bars, music envelope vs VO envelope)
- **`projectStore` เพิ่ม 2 actions:** `addClip()` (return id ใหม่, used by drop), `resizeClip(id, posMs, durMs)` (left/right trim ผ่าน action เดียว — D-024)
- **`index.css` เพิ่ม:** `.cc-tick / .cc-tick-minor` (ruler ticks), `.cc-row-grid` (ใช้ `--major-px` CSS var), `.cc-clip-selected / .cc-clip-dragging`, trim-handle hover reveal
- **Timeline components (6 ไฟล์ใหม่):**
  - `TrackHeader.tsx` — color swatch + label + tag + mute/lock/visibility toggles
  - `TimelineRuler.tsx` — sticky ticks, click+drag scrub, ใช้ `pickRulerStep()` จาก timecode utils
  - `Playhead.tsx` — accent line + triangle handle, inside `.tl-inner` (scrolls with content)
  - `TimelineClip.tsx` — 4 body variants (rich/thumb/wave/flat), trim handles, fx pips, label/duration, collab pulse border
  - `TimelineToolbar.tsx` — 3 tools + split/delete actions + snap toggle + zoom controls (-, value, +, Fit)
  - `Timeline.tsx` — main composition, drag handlers inline (move + 2 trim handles), drop target (with type-compat check), snap-line state, remote cursor markers
- **เพิ่ม HistoryEntry sample จาก D-024:** trim history เขียน `desc: "Trimmed ${side}"` รวมข้อมูล side ใน description

### Decisions
- **D-022** DOM-based (not Canvas) — ตอบ Q1 ใน §5.10 แล้ว
- **D-023** drag handlers inline ใน Timeline (ไม่แยก hook)
- **D-024** single `resizeClip` action สำหรับทั้ง 2 trim sides
- **D-025** drop target validates MIME + type compatibility

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ 308 KB JS / 95 KB gzipped (+17 KB raw จาก Phase 1.5) |
| Track headers แสดง 4 tracks (V1 / V2 / A1 / A2) พร้อม mute/lock/visibility | ✅ |
| Ruler ticks หนาแน่นตาม zoom + click-drag scrub seek | ✅ |
| 12 clips render ครบ พร้อม thumbnail strips บน video + waveform บน audio | ✅ |
| Drag clip → snap to other clip edges + playhead, snap guide line ปรากฏ | ✅ |
| Hold Alt ขณะ drag → disable snap | ✅ |
| Trim left/right handles → resize ถูกต้อง (left pin right edge) | ✅ |
| Blade tool → click clip → seek + split | ✅ |
| Delete button ใน toolbar → ลบ selected clips + history push | ✅ |
| Mira's clip (c6) มี mint pulse border จาก collabStore.cursors | ✅ |
| Drag asset จาก AssetBrowser drop บน video track → สร้าง clip ใหม่ | ✅ |
| Zoom +/-/Fit คุม pxPerSec ผ่าน uiStore.zoomLevel | ✅ |

### DESIGN.md updates
- ตอบ Q1 (DOM vs Canvas) จริง ๆ ใน `frontend/DESIGN.md`
- Phase progress: 1.6 ✅

### Gotchas
*(ไม่มี — utils/geometry จาก Phase 1.3 + readonly types ช่วยทำให้ component layer ตรงไปตรงมา)*

---

## ⌨️ Phase 1.7 — Overlays + CollabSimulator + Keyboard shortcuts

**Date:** 2026-05-18 · **Status:** ✅

### Goal
ครบ "feels like a pro editor" — 4 overlays (shortcuts/effects browser/history/toasts), collab simulator ที่ดัน cursors + toasts ตามสคริปต์, keyboard shortcuts hook ครอบ entire app

### What was done
- **`index.css` เพิ่ม:** `@keyframes cc-toast-in` + `--animate-cc-toast-in` token
- **4 overlay components:**
  - `ShortcutsOverlay.tsx` — modal 3-column (Playback/Editing/Timeline), Escape ปิด, click backdrop ปิด
  - `EffectsBrowser.tsx` — 4×3 grid, **12 effect cards**, 4 ตัวที่ wireable (brightness/contrast/saturation/blur) click → addEffect ที่ selected clip
  - `HistoryPanel.tsx` — fixed top-right, undo/redo buttons + click entry → jumpTo, undone entries fade
  - `ToastStack.tsx` — fixed bottom-right, slide-in animation, click dismiss
- **2 collaboration components:**
  - `CollabSimulator.tsx` — headless (return null), 12-step SCRIPT loop ทุก 3.5s, push 2 scripted toasts
  - `ViewportCursors.tsx` — mount ใน VideoPlayer container, ratios resolve ตาม player viewport
- **1 hook:** `useKeyboardShortcuts.ts` — Space/V/B/H/S/N/?/Del/Home/End/← →/⌘Z/⇧⌘Z/⌘+/⌘-/⌘0 ทั้งหมด, skip ตอน focus อยู่ใน input
- **App.tsx integration:** mount overlays + collab + hook ครบ
- **VideoPlayer.tsx update:** ใส่ `relative` + ViewportCursors เป็นชั้นแรก

### Decisions
- **D-026** keyboard hook ใช้ `getState()` ภายใน listener
- **D-027** overlays ใช้ `position: fixed` (ไม่ใช้ React Portal)
- **D-028** CollabSimulator เป็น headless component
- **D-029** ViewportCursors mount ใน VideoPlayer

### Verification
| Check | Result |
|-------|:------:|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ 321 KB JS / 99 KB gzipped (+13 KB raw จาก Phase 1.6) |
| Press `?` → Shortcuts modal เปิด, Esc ปิด | ✅ |
| Inspector Effects tab → Browse → modal effects ปรากฏ, click brightness → เพิ่มใน selected clip | ✅ |
| TopBar history button → HistoryPanel เปิด, click entry → jumpTo undone state | ✅ |
| Toast หล่นมาจาก CollabSimulator step 4/7 (Mira moved demo_result.mp4) | ✅ |
| Alice/Devon cursor floating arrow บน player viewport, smooth transition ทุก 3.5s | ✅ |
| Mira cursor บน timeline ruler (with name pill) + pulse border ที่ c6 | ✅ |
| Space → play/pause; V/B/H → tool switch; Del → delete selected | ✅ |
| ⌘Z → undo; ⌘⇧Z → redo (history cursor ขยับ) | ✅ |
| ⌘+/⌘- → zoom; ⌘0 → fit | ✅ |
| Home/End → seek 0 / durationMs | ✅ |
| ← → → step frame; Shift+← → → step 1s | ✅ |
| พิมพ์ใน asset search input — shortcut ไม่ trigger (skip on input) | ✅ |

### DESIGN.md updates
- Phase progress: 1.7 ✅

### Gotchas
*(ไม่มี — hook + simulator + overlay layer composed cleanly บน store API ที่มี)*

---

## 🧪 Phase 1.8 — Vitest + tests + DESIGN.md final pass

**Date:** 2026-05-18 · **Status:** ✅ — **Phase 1 ปิดท้าย!**

### Goal
- เขียน test ครอบ utilities + projectStore (Rule 10 ขั้นต่ำ + เผื่อ Excellent)
- เติม `frontend/DESIGN.md` ตอบ §5.10 ครบ 7 ข้อ พร้อม build evidence + Phase 5 plan
- Confirm `pnpm test:run` ผ่านทุก suite

### What was done
- **5 test files / 59 tests** (colocated ใน `src/`):
  - `utils/timecode.test.ts` — 13 tests (fmtTC ทุก fps + floating-point edge, fmtClipDur, pickRulerStep, fmtRulerTick)
  - `utils/geometry.test.ts` — 12 tests (pxPerSec clamp, msToPx roundtrip, clipBox, snap × 6 edge cases)
  - `utils/playback.test.ts` — 11 tests (clipAtTime V2/V1 overlap + audio skip + exclusive end, filterFromEffects identity + disabled + composition)
  - `utils/waveform.test.ts` — 6 tests (determinism + bar-count clamping + valid SVG path)
  - `state/projectStore.test.ts` — 17 tests (load + 6 mutation actions + effect lifecycle + cascade cleanup)
- **`utils/timecode.ts` bug fix** จากการเขียน test (ดู G-007)
- **`frontend/DESIGN.md` ปัดสุดท้าย**: Q3 (undo log + Phase 5 inverse-op plan), Q4 (optimistic + reconcile flow), Q6 (3-tier scaling plan w/ bundle evidence — 321KB JS / 99KB gzipped), Q7 (Pusher channel topology + 60ms throttle), test-coverage table
- Phase 1.8 row เพิ่มใน DESIGN.md Phase progress table

### Decisions
- **D-030** tests colocated ใน `src/` (ไม่ใช่ `frontend/tests/`)
- **D-031** undo เป็น log of events + Phase 5 จะ evolve เป็น inverse-op

### Verification
| Check | Result |
|-------|:------:|
| `pnpm test:run` | ✅ 59/59 tests passed (5 files, ~1.4s) |
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ 321 KB JS / 99 KB gzipped |
| Rule 10 (testing minimums) — timecode util ✓ snap logic ✓ command-equivalent (store) ✓ | ✅ |

### Gotchas

#### G-007 — `fmtTC` floating-point bug at exact frame boundaries
**Symptom:** เขียน test `expect(fmtTC(500, 30)).toBe('00:00:00:15')` แต่ได้ `'00:00:00:14'`
**Cause:** สูตรเดิม `Math.floor((total % 1000) / (1000 / fps))` ที่ port จาก prototype: `500 / (1000/30) = 500 / 33.333... = 14.99999...` → floor → 14 (ผิด)
**Fix:** เปลี่ยนเป็น integer math ก่อนหาร — `Math.floor((total % 1000) * fps / 1000)` → `500 * 30 / 1000 = 15` (ถูก) + `Math.min(fps - 1, …)` cap กัน rollover เคสที่ ms ลงท้ายด้วย .999...
**Lesson:** Prototype bug-for-bug port ไม่ใช่ที่ดีเสมอ — เขียน test แล้วจะเจอ edge case ที่ visual แทบไม่เห็น (frame 14 vs 15 ใน TC display คนดูไม่ทันสังเกต)

---

## 🎉 Phase 1 ปิด — ภาพรวม

| # | Phase | บรรทัด LOC ใหม่ | Bundle delta |
|---|-------|---:|---|
| 0 | Monorepo + Docker | ~300 | (backend/worker placeholder) |
| 1.1 | Vite + TS + Tailwind + shadcn | ~250 | first frontend, 212 KB |
| 1.2 | Design tokens + layout | ~600 | +37 KB |
| 1.3 | Stores + types + mocks | ~700 | +12 KB |
| 1.4 | TopBar + AssetBrowser | ~500 | +9 KB |
| 1.5 | Player + Inspector | ~800 | +21 KB |
| 1.6 | Timeline | ~900 | +17 KB |
| 1.7 | Overlays + Collab + shortcuts | ~600 | +13 KB |
| 1.8 | Tests + DESIGN.md | ~700 (tests) | (no shippable code) |
| **Total** | **frontend full** | **~5,350** | **321 KB JS / 99 KB gz** |

**Rules unlocked by end of Phase 1:** #7 (TS strict) · #8 (shadcn only) · #9 (no other UI fw) · #10 (tests) · #11 (README) · #12 (frontend/DESIGN.md เต็ม) · #13 (.env.example). Rules ที่เหลือ (#1–#6 = Rust + ffmpeg + migrations) จะ unlock ใน Phase 2–4.

---

## 🗄️ Phase 2 — Database schema + migrations + seed

**Date:** 2026-05-18 · **Status:** ✅

### Goal
สร้าง PostgreSQL schema ที่รองรับทุก entity ของ CloudCut, indexes พร้อม rationale,
seed data สำหรับ dev environment และ `docs/database-design.md` ตอบ §1.4 (8 ข้อ) ครบ

### What was done
- `backend/migrations/0001_init.sql` — enums + 15 tables พร้อม triggers `set_updated_at()`
- `backend/migrations/0002_indexes.sql` — 18 indexes พร้อม inline rationale ทุกตัว
- `backend/migrations/0003_seed.sql` — 2 users, 1 workspace, 1 project, 4 tracks, 3 assets, 3 clips
- `docs/database-design.md` ตอบ 8 คำถามใน §1.4 ครบ:
  - Q1: UUID PK (client-side gen + enum safety)
  - Q2: hard delete + `ON DELETE CASCADE/SET NULL` strategy
  - Q3: normalised `clip_effects` vs JSONB — เลือก normalised เพราะ filter บน `type`/`enabled`
  - Q4: range partition `operation_logs` รายเดือน + pg_cron maintenance plan
  - Q5: index philosophy (covering index + partial index)
  - Q6: FPS/resolution project-level only
  - Q7: S3 key convention (`originals/`, `variants/`, `exports/`)
  - Q8: operation-log append (แทน CRDT/OT) — last-writer-wins per clip

### Decisions

| # | Decision | เหตุผล |
|---|----------|--------|
| **D-032** | `operation_logs` ใช้ BIGSERIAL id (ไม่ใช่ UUID) | append-only high-throughput — sequential id compress ดีกว่าใน B-tree partition |
| **D-033** | `operation_logs` ไม่มี FK ไปยัง `projects` | cross-partition FK scan ช้า — enforce ที่ application layer ใน Axum handler แทน |
| **D-034** | Seed guard: `0003_seed.sql` รันเฉพาะเมื่อ `CLOUDCUT_SEED_DATA=true` | กัน seed data หลุดเข้า production โดยไม่ได้ตั้งใจ |
| **D-035** | `invitations.token` เป็น `DEFAULT encode(gen_random_bytes(32), 'hex')` | 32 bytes = 256-bit entropy — ไม่ต้องส่ง token จาก application layer ให้ DB gen เอง |
| **D-036** | `clip_effects` เก็บ `position` (smallint) สำหรับ render order | ffmpeg filter-graph ต้องการ order ที่แน่นอน — JSONB array ทำได้แต่ query/update ยุ่งยากกว่า |

### Verification

```bash
# รัน migrations บน dev Postgres
docker compose up -d
sqlx migrate run --database-url "postgresql://cloudcut:cloudcut_dev@localhost:5432/cloudcut"

# ตรวจสอบ tables
psql -U cloudcut cloudcut -c "\dt"
# → ควรเห็น 15 tables + partition tables operation_logs_2026_*

# Seed data
CLOUDCUT_SEED_DATA=true sqlx migrate run ...
psql -U cloudcut cloudcut -c "SELECT email, display_name FROM users"
# → alice@cloudcut.dev, mira@cloudcut.dev
```

### Rules unlocked
- ✅ **Rule #4** — migrations directory พร้อม (`backend/migrations/0001..0003`)
- ✅ **Rule #12** — `docs/database-design.md` เต็ม (Phase 2 section)

---

## 📝 How to update this log

ทุกครั้งที่ทำ phase ใหม่จบ ให้:

1. **Update timeline table** — เปลี่ยน status เป็น ✅ + ใส่ date
2. **เพิ่ม section ใหม่** ตาม template ด้านบน (Goal / What / Decisions / Verification / Gotchas)
3. **บันทึก decisions ใหม่** ใน Key decisions table (D-XXX) — ใส่เหตุผลด้วย
4. **บันทึก gotchas** เป็น G-XXX — มี problem + cause + ลองอะไรไม่ผ่าน + แก้ยังไง
5. **อัปเดต DESIGN.md ของ crate ที่เกี่ยวข้อง** — ดู section ถัดไป

ตัวอย่างที่ดี: G-002 ข้างบน — บันทึกทั้ง trial-and-error เพราะถ้าเจออีกครั้งหน้าจะรู้ทันทีว่าอะไรไม่ได้

---

## 📑 DESIGN.md per-phase checklist (สำคัญสำหรับคะแนน)

Rule #12 บังคับให้มี DESIGN.md ของ backend / worker / frontend แต่ rubric ให้คะแนน **Excellent** เฉพาะตอนตอบ "ลึก" (ดู scoring table ใน [`uploads/cloudcut-mid-test.md`](docs/prototype/cloudcut-mid-test.md) ถ้ามี). กลยุทธ์: **เติม DESIGN.md ตอน phase จบ ไม่เขียนล่วงหน้า** เพราะจะกลายเป็นนิยาย (อ้าง file/ตัวเลข/measurement ไม่ได้)

| Phase จบ | ไปอัปเดตไฟล์นี้ | ใส่อะไร |
|----------|----------------|---------|
| 1.x      | `frontend/DESIGN.md` | ตอบบางคำถามใน §5.10 (7 ข้อ) ที่เกี่ยวข้องกับ scope ของ phase นั้น |
| 2        | `docs/database-design.md` + `backend/DESIGN.md` (DB section) | ตอบ §1.4 (8 ข้อ) + storage estimation + partition strategy |
| 3        | `backend/DESIGN.md` | ตอบ §2.7 (9 ข้อ) — Axum/SQLx เหตุผล, cursor pagination, presigned flow, error handling |
| 4        | `worker/DESIGN.md` | ตอบ §3.13 (8 ข้อ) — Redis Streams เหตุผล, retry/idempotency, memory for long video, cost estimate |
| 5        | `backend/DESIGN.md` + `frontend/DESIGN.md` (Collab section) | ตอบ §4.8 (8 ข้อ) — Pusher, throttling, offline reconnect, CRDT consideration |

**Final pass ก่อนส่ง** (Phase 1.8 + after Phase 5): อ่านทุก DESIGN.md อีกรอบ เติม section ที่ยังว่าง + ใส่ตัวเลขจริง (bundle size, RSS memory, build time, test count) เพื่อ push เป็น Excellent

---

## 🔗 ลิงก์ที่เกี่ยวข้อง

- [README.md](README.md) — overview + quick start
- [docs/architecture.md](docs/architecture.md) — system diagram
- [docs/database-design.md](docs/database-design.md) — ER + indexes (Phase 2)
- [docs/api-spec.md](docs/api-spec.md) — endpoint groups (Phase 3)
- [backend/DESIGN.md](backend/DESIGN.md) — backend decisions (Phase 3)
- [worker/DESIGN.md](worker/DESIGN.md) — worker decisions (Phase 4)
- [frontend/DESIGN.md](frontend/DESIGN.md) — frontend decisions (Phase 1.8)
- [docs/prototype/](docs/prototype/) — original HTML/JSX prototype (reference only)
