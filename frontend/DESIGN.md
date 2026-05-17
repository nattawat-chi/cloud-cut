# Frontend — Design notes

> Running design document for the CloudCut editor UI.
> Updated incrementally per phase. Sections marked **TBD** land when the
> matching implementation phase finishes (see [`../DEV_LOG.md`](../DEV_LOG.md)).

---

## Stack — locked decisions

| Choice | Rationale |
|--------|-----------|
| **React 19** + **TypeScript strict** | Rule 7 of the brief. `tsconfig.app.json` enables `strict`, `noImplicitAny`, `strictNullChecks`, `useUnknownInCatchVariables`, plus linting flags (`noUnusedLocals`, `noImplicitReturns`, `noFallthroughCasesInSwitch`). |
| **Vite 8** | Fast dev (~215ms boot, sub-100ms HMR), native ESM, simple plugin model. `@tailwindcss/vite` and Vitest integrate without extra config. |
| **Tailwind CSS v4** | CSS-first theme via `@theme inline`. No PostCSS/autoprefixer plumbing. Variables are the public theme API → editor and shadcn share one source of truth. |
| **shadcn/ui ("new-york" style)** | Rules 8 + 9 (no MUI/AntD). Density matches a pro video editor. Components are vendored, not imported — easier to audit and adjust. |
| **Zustand v5** | Three vertical slices (project / ui / playback) keep concerns isolated. Smaller than Redux, no Provider boilerplate, plays nicely with Pusher event handlers in Phase 5. |
| **react-resizable-panels v3** (not v4) | shadcn's `Resizable*` wrappers are written against v3's `PanelGroup` / `PanelResizeHandle` named exports. v4 renamed everything (`Group`, `Separator`); upstream shadcn hasn't migrated. See [`DEV_LOG.md` G-005 + G-006](../DEV_LOG.md). |
| **Vitest** + `@testing-library/react` + `jsdom` | Rule 10. `vitest.config.ts` extends `vite.config.ts` via `mergeConfig` so we avoid http-proxy type drift between Vite 8 and Vitest 2 (G-004). |
| **pnpm** | Rule of brief + deterministic lockfile + content-addressable store keeps disk usage low across worktrees. |
| **lucide-react** for icons | Tree-shakable, single source, looks correct at 14–18px (the editor's icon size). |

---

## Folder layout — current

```
src/
├── App.tsx                       mounts <EditorLayout />
├── main.tsx                      React 19 root + StrictMode
├── index.css                     4-layer theme (see "Theming")
├── lib/utils.ts                  shadcn `cn()` helper
├── hooks/
│   └── useTheme.ts               Phase 1.2 — moved to uiStore in Phase 1.3
├── components/
│   ├── ui/                       shadcn primitives (vendored)
│   │   └── resizable.tsx         wraps `react-resizable-panels` v3
│   ├── layout/EditorLayout.tsx   48px topbar + nested ResizablePanelGroups
│   ├── topbar/TopBar.tsx         brand / project crumb / theme / share / export
│   ├── assets/AssetBrowser.tsx   placeholder (Phase 1.4)
│   ├── player/VideoPlayer.tsx    placeholder (Phase 1.5)
│   ├── inspector/InspectorPanel.tsx  placeholder (Phase 1.5)
│   ├── timeline/Timeline.tsx     placeholder (Phase 1.6)
│   └── shared/
│       ├── PanelHead.tsx         36px uppercase strip used by every panel
│       └── PanelPlaceholder.tsx  empty-state filler
├── state/                        Zustand stores (Phase 1.3)
├── services/                     REST client (Phase 3 onwards)
├── utils/                        timecode.ts, geometry.ts (Phase 1.3)
├── types/                        domain DTOs (Phase 1.3)
└── mocks/                        cloudcut.ts — mirrors backend seed (Phase 1.3)
```

---

## Theming — `src/index.css`

Two layers of CSS variables, mapped through Tailwind v4's `@theme inline`:

```
1. Functional palette          ← editor reads these directly
   --bg-0 … --bg-4             surface scale
   --text-1 … --text-4         text hierarchy
   --clip-v-1/v-2, --clip-a-1/a-2  track colors
   --row-h: 60px, --ruler-h: 28px, --header-w: 168px   timeline dimensions

2. shadcn semantic mapping     ← shadcn primitives read these
   --background → var(--bg-0)
   --foreground → var(--text-1)
   --accent     → var(--accent)
   …

3. @theme inline               ← exposes both as Tailwind utilities
   bg-surface-1, text-text-3, bg-clip-v-1, border-line-soft
   bg-background, text-foreground            (shadcn-compatible)

4. Element baselines           Geist font, body bg, overflow hidden
```

Why two layers? Editor components (`Clip`, `Ruler`, `TrackHeader`) want
functional names — `bg-clip-v-1`, `text-text-2`. shadcn primitives want
semantic names — `bg-background`, `text-muted-foreground`. Mapping one onto
the other lets a single Tweaks-panel accent change repaint both.

Theme switch driven by `<html data-theme="…">`. Custom Tailwind variant
`@custom-variant dark (&:where([data-theme="dark"], …))` ties `dark:*` utilities
to the same attribute.

---

## Layout — `EditorLayout`

```
ResizablePanelGroup  vertical (autoSaveId="cloudcut:editor:v1")
├── ResizablePanel   62% — upper row
│   └── ResizablePanelGroup  horizontal
│       ├── ResizablePanel   20% (min 14, max 35)   AssetBrowser
│       ├── ResizablePanel   55% (min 30)           VideoPlayer
│       └── ResizablePanel   25% (min 16, max 38)   InspectorPanel
└── ResizablePanel   38% (min 20, max 70)           Timeline
```

`autoSaveId` persists panel ratios in `localStorage` — survives reload and
HMR. Min/max sizes prevent panels from becoming unusable (e.g. AssetBrowser
collapsing below 14% breaks the tabs).

---

## The 7 questions from brief §5.10

### 1. DOM-based timeline or Canvas 2D?
**Implemented DOM-based in Phase 1.6.** Each clip is one `<div>` absolute-positioned within its track row; waveforms are `<svg><path>` with a hashed deterministic d-attribute (see [`src/utils/waveform.ts`](src/utils/waveform.ts)). Thumbnail strips are CSS gradients across N child divs.

**Why DOM, not Canvas:**
- Accessibility free: tab order, screen-reader landmarks, browser zoom — all work without effort.
- React composition wins: collab pulse borders, selection rings, fx pips, drop targets are trivial as nested elements; on Canvas each would need its own hit-test pass.
- DevTools-friendly: inspecting a clip in DevTools shows its computed CSS, which made Phase 1.2 styling iterations fast.

**When DOM stops paying off:** profile in Phase 1.8 with React DevTools `Highlight updates`. If a single timeline frame exceeds ~8ms at 1000 clips, swap the clip-rendering layer to Canvas (keep track headers + ruler + toolbar in DOM for accessibility). The store API is unchanged; only the leaf component swaps.

**What helps DOM stay fast today:** `TimelineClip` is memoizable by `(id, version, leftPx, widthPx, selected)`; `version` is bumped only on mutation, so dragging one clip doesn't re-render the others. Waveform `d` strings are `useMemo`'d by `(clipId, widthPx)`.

### 2. State split across project / UI / playback
**Implemented in Phase 1.3.** Five stores, sliced by **data lifetime** rather than feature:

| Store | Lifetime | Owns | Subscribers (planned) |
|-------|----------|------|------------------------|
| `projectStore` | Server-owned | `Project`, `Track[]`, `Clip[]`, `effects: Record<ClipId, ClipEffect[]>`. 10 mutating actions (move/trim/split/delete clip, add/toggle/update/remove effect, toggleTrack, loadMockProject). | Timeline, Inspector, Player, TopBar (project name + duration) |
| `uiStore` | Session-only | selection, tools, zoom, scroll, snap, asset/inspector tabs, theme, overlay visibility, tweaks surfaces (clipStyle, presence, trackPreset). 18 actions. | every interactive panel |
| `playbackStore` | Animation-driven | `currentTimeMs`, `isPlaying`, `playbackSpeed`, `volume`, `isMuted`. Driven by RAF in Player. | Player, Timeline playhead |
| `historyStore` | User-log | undo/redo entries + transient toasts. `push()` is called after every confirmed mutation. | TopBar (undo/redo buttons), HistoryPanel, ToastStack |
| `collabStore` | Event-driven | collaborators + cursor positions per user. Driven by `CollabSimulator` in Phase 1.7; replaced by Pusher subscription in Phase 5. | RemoteCursors, presence avatars in TopBar |

**Why 5, not 3?** The brief says "อย่างน้อย 3". Splitting `history` and `collab` keeps the RAF-driven playback ticker from accidentally re-rendering history panels and vice-versa — selector identity stays stable per slice.

**Why plain `create()` (no middleware)?** Mutations remain shallow today; `set((s) => ({ … }))` reads cleanly. Immer / devtools / subscribeWithSelector enter the picture when nested effect-list mutations get hairy (Phase 1.5).

Files: [`src/state/{project,ui,playback,history,collab}Store.ts`](src/state/) · types in [`src/types/index.ts`](src/types/index.ts) · mock fixture in [`src/mocks/cloudcut.ts`](src/mocks/cloudcut.ts).

### 3. Undo / redo command pattern
**Implemented as a log-of-events in Phase 1.7; evolves into inverse-op pattern in Phase 5.**

**Today:** every mutation in `projectStore` is paired with a `historyStore.push({ type, desc, who })` call (see [Timeline.tsx](src/components/timeline/Timeline.tsx#L114) and overlay actions). `cursor` tracks the active entry; `jumpTo(idx)` marks later entries as `undone` (visual fade) and `undo()/redo()` step the cursor. Keyboard shortcuts (`⌘Z`, `⇧⌘Z`) wire to the same actions.

**Why a log, not full Command pattern, in Phase 1?**
- Mutations are pure shape-shifts; recording an inverse op per action would be ~5 lines of boilerplate per action with no testable benefit at single-user scale.
- The 17 store-action tests in [`projectStore.test.ts`](src/state/projectStore.test.ts) prove every mutation is reproducible from its inputs — that's the same property a Command's `execute()` would need.

**Phase 5 evolution.** When Pusher operations arrive, `projectStore` gains `applyOperation(op)` which accepts both local and remote ops. Each `applyOperation` call records the **inverse op** alongside the forward op in `historyStore`. `undo()` then dispatches the inverse op back through `applyOperation`, which broadcasts to peers. This collapses local undo and remote conflict resolution into one mechanism. The Command-pattern boilerplate becomes **data** (serializable ops) instead of **code** (closures) — easier to replay, log, and test.

**Persistence**: in-memory only; cap at 50 entries in Phase 5 to bound growth.

### 4. Optimistic update + server reconciliation
**Designed in Phase 1; implemented in Phase 5.**

**Flow:**
1. User triggers a mutation (e.g. drag clip from 5s → 8s).
2. `projectStore.moveClip('c2', 8000)` runs immediately; `version` bumps from N → N+1.
3. UI repaints in the next frame (player filter, timeline position, inspector inputs).
4. `services/api.ts` debounces and fires `PATCH /projects/:id/clips/:clipId { posMs: 8000, version: N+1 }`.
5. Server validates, persists, broadcasts `clip-updated` on `private-project-{id}` with the **canonical** `server_seq`.
6. Original client receives the broadcast, confirms its local state, swallows the echo.
7. Peer clients receive the broadcast, call `projectStore.applyRemoteUpdate(payload)` which last-write-wins by `server_seq`.

**Conflict UI:** if a remote update overwrites a local change (same field, different value), `historyStore.toast()` fires a "Mira moved this clip while you were editing — synced to server version" message; the local change shows as undone in the history panel so the user can re-apply if desired.

**Property-level merge** (Phase 5 stretch): if local edit touches field X and remote edit touches field Y on the same entity, merge both. Server tracks per-field `last_seq` so this is safe.

**Offline reconnect:** when the Pusher socket reconnects, client calls `GET /projects/:id/operations?afterSeq=last_seen_seq` and replays missed ops. If the gap exceeds N (e.g. 200), client falls back to a full `GET /projects/:id` re-hydrate (cheaper than replaying thousands of ops).

### 5. Timeline zoom / snap math
**Formula (locked from prototype port):**

```
pxPerSec  = zoomLevel * 50          # zoomLevel 0.3 – 4.0
pxPerMs   = pxPerSec / 1000
clipLeftPx  = clip.posMs * pxPerMs
clipWidthPx = clip.durMs * pxPerMs

# Ruler tick interval — picks the smallest power-of-{0.5,1,2,5,10,30,60}s
# that yields ≥60px per major tick at the current zoom.
secStep = first s ∈ [0.5, 1, 2, 5, 10, 30, 60]  where s * pxPerSec >= 60

# Snap threshold during clip drag (Phase 1.6)
snapPx = 14
snapMs = snapPx / pxPerMs           # tightens at high zoom, loosens at low
```

Candidate snap targets: every other clip's start/end + playhead + 0. Snap math lives in [`src/utils/geometry.ts#snap`](src/utils/geometry.ts) with 6 unit tests covering edge cases (no candidates, exact threshold, end-edge pinning, threshold tightening at high zoom — see [`geometry.test.ts`](src/utils/geometry.test.ts)).

### 6. Scaling to 10,000 clips
**Plan — gated on Phase 1.8 profiling. Today's editor handles the 12-clip demo at 60fps comfortably.**

**Current performance budget (measured Phase 1.8 build):**
- JS bundle: 321 KB raw / 99 KB gzipped (entire app, including 12 clips of mock data)
- Single drag updates one clip's `posMs` → only that clip re-renders (`version` only bumps on the dragged clip)
- Waveform `<path d>` strings are `useMemo`'d by `(clipId, widthPx)` so resize is the only invalidator

**Three-tier scaling plan, switch as profiling demands:**

| Clip count | Bottleneck | Mitigation |
|-----------:|-----------|-----------|
| < 200      | None      | Current implementation |
| 200–2,000  | DOM count + initial render | **Viewport culling** — only render clips whose `[posMs, posMs+durMs]` intersects `[scrollX, scrollX + viewportWidth]`. Off-viewport clips are absent from the DOM. |
| 2,000–10,000+ | Per-clip render cost | **Canvas layer** for clip bodies (rect + thumb/wave bitmap); DOM stays for selection ring + collab pulse + drop targets only |

**Hot-swap path:** the store API is unchanged; only `TimelineClip` swaps from `<div>` to a `<canvas>` cell within the row. Selectors, drag handlers, snap math, and tests remain identical.

**What we already do that helps:**
- Selectors are narrowly scoped (e.g. TopBar reads `selectTotalDurationMs` only — not the full clips array)
- `clip.version` bumps per mutation so React's reconciler short-circuits unchanged clips
- Snap candidates are computed lazily inside the drag's `mousemove` handler, not on every render

### 7. Pusher operation sync ↔ Zustand
**Designed in Phase 1; implemented in Phase 5.**

**Subscription topology:**

| Channel | Purpose | Events | Subscriber hook |
|---------|---------|--------|------------------|
| `presence-project-{id}` | Who's online + cursors | `member_added/removed`, `client-cursor-move`, `client-editing-clip` | `usePresence()` → `collabStore` |
| `private-project-{id}` | Timeline operations | `operation`, `clip-updated`, `effect-updated`, … | `useOperationSync()` → `projectStore.applyOperation` |
| `private-user-{id}` | Per-user jobs | `job-progress`, `asset-ready`, `export-completed/failed` | `useJobUpdates()` → `historyStore.toast` |

**Wiring strategy:**
1. A single `<PusherProvider>` at the app root owns the `Pusher` client instance — connected once, disposed on unmount.
2. `usePresence()` mounts when a project is loaded; subscribes to `presence-*`; mutates `collabStore.cursors` from member events. **Throttles `client-cursor-move` to 60ms** at the emitter (16 messages/s/user) to stay within Pusher rate limits.
3. `useOperationSync()` mounts alongside the project; on `operation` events it calls `projectStore.applyOperation(payload)` which:
   - confirms the local optimistic state (if `op.userId === me && op.client_seq === pending`)
   - or applies the remote op as a new mutation, recording the inverse for undo
4. `useJobUpdates()` subscribes for the duration of the user's session.

**Zustand integration is one-way:** Pusher events → store. The store never writes back to Pusher — server-side broadcast is the source of truth. Client emits operations through `services/api.ts` (REST PATCH); server echoes via Pusher. This keeps the data flow unidirectional and trivial to reason about.

**Why Pusher rather than raw WebSocket?** Spec mandate (§4), but also: presence + auth + per-channel subscriptions out of the box, hosted reliability, fallback transports for restrictive networks. Trade-off in §4.8 of the brief: cost at scale; mitigated by throttling and channel sharding.

---

## Phase progress

| Phase | Done | DESIGN.md sections updated |
|------:|:----:|----------------------------|
| 1.1 | ✅ | Stack table, folder layout |
| 1.2 | ✅ | Theming, Layout, Q5 (zoom math), Q2 (state split plan) |
| 1.3 | ✅ | Q2 — store layout with action counts |
| 1.4 | ✅ | — (no new §5.10 questions; Presence + AssetBrowser are pure UI ports) |
| 1.5 | ✅ | — (Q4/Q5 still need Timeline + Phase 5) |
| 1.6 | ✅ | Q1 answered (DOM, with Canvas fallback plan) · Q5 implementation done · Q6 virtualization gated on Phase 1.8 profiling |
| 1.7 | ✅ | — (Q3 command-pattern formalization deferred to Phase 1.8 — current `historyStore.push` works but lacks per-action `undo()`/`redo()` closures) |
| 1.8 | ✅ | Q3 (undo log + Phase 5 inverse-op plan) · Q4 (optimistic + reconcile flow) · Q6 (3-tier scaling plan w/ bundle evidence) · Q7 (channel topology + throttle) · Vitest suite live |

---

## 🧪 Test coverage (Phase 1.8)

Vitest + jsdom; run with `pnpm test` (watch) or `pnpm test:run` (CI).

| Module | File | Tests | Covers |
|--------|------|------:|--------|
| `utils/timecode` | [`timecode.test.ts`](src/utils/timecode.test.ts) | 13 | fmtTC (incl. floating-point boundary), fmtClipDur, pickRulerStep, fmtRulerTick |
| `utils/geometry` | [`geometry.test.ts`](src/utils/geometry.test.ts) | 12 | pxPerSec clamping, msToPx roundtrip, clipBox, snap (5 edge cases) |
| `utils/playback` | [`playback.test.ts`](src/utils/playback.test.ts) | 11 | clipAtTime (V2 over V1, audio skip, exclusive end), filterFromEffects (identity, brightness offset, disabled skip) |
| `utils/waveform` | [`waveform.test.ts`](src/utils/waveform.test.ts) | 6 | deterministic output, bar count clamping, valid SVG path |
| `state/projectStore` | [`projectStore.test.ts`](src/state/projectStore.test.ts) | 17 | mock hydration, addClip clamping, moveClip/resizeClip, splitClipAt edge-case rejection, deleteClips + orphaned-effect cleanup, all 4 effect actions, toggleTrack |
| **Total** | | **59** | |

**Rule 10 (testing minimums) satisfied:** timecode util ✓ · snap logic ✓ · "command manager" via projectStore mutations ✓.

**Found while writing tests:** `fmtTC` had a floating-point precision bug at exact frame boundaries (500ms / 30fps returned frame 14 instead of 15 because `500 / (1000/30)` evaluates to 14.999999…). Switched to integer math `(ms * fps) / 1000` — see [G-007 in DEV_LOG](../DEV_LOG.md).
| 1.8 | ⏳ | Tests, fill remaining gaps, final polish |
| 5 | ⏳ | Q4 (optimistic update), Q7 (Pusher integration) |
