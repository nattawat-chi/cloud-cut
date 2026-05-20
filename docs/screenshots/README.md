# Screenshots

Screenshots of the running CloudCut editor for the readiness review (Rule 14).
Replace these placeholders with real captures from your local environment — the
top-level [`README.md`](../../README.md#screenshots) already links to the file
names listed below, so a drop-in replacement is enough.

## How to capture

1. **Boot the full stack:**
   ```bash
   docker compose up -d
   cargo run -p backend      # terminal 1
   cargo run -p worker       # terminal 2
   cd frontend && pnpm dev   # terminal 3
   ```
2. Open http://localhost:5173, log in / register, and upload at least one
   video + one audio asset so the editor has something to render.
3. Drag the assets onto the timeline (V1 + A1) so the preview is populated.
4. Capture each screenshot with **Win + Shift + S** (Windows) or
   **Cmd + Shift + 4** (macOS) and save into this folder using the names below.

## Required files

| File | What it should show |
|---|---|
| `editor.png` | Full editor — topbar (with PRO/free plan badge), Assets panel (with real thumbnails), Preview with timecode overlay, Timeline with at least one V1 clip and one A1 clip, Inspector showing the selected clip's properties. |
| `export.png` | Export dialog opened, showing the live quota line ("Exports running: 1/10 · Uploads this hour: 3/50") and progress bar mid-encode (≈ 30 %). |
| `collab.png` | Two browser windows side-by-side (logged in as two users). Both viewports should show floating cursor arrows + the avatar pills in the top-right collaborator list. |

## Optional extras

| File | What it should show |
|---|---|
| `rate-limit-429.png` | Toast / error banner that appears when a free-plan workspace tries to start a 3rd concurrent export. |
| `presence-cursors.gif` | Short Loom / OBS recording (≤ 20 s) of two collaborators moving clips and cursors in real time. |
| `swagger-ui.png` | http://localhost:8080/swagger-ui — proves the OpenAPI surface is wired up (Rule 5 documentation). |

Keep each PNG under ~500 KB if possible (use `tinypng` or similar) so the repo
clone stays light. Demo videos go in [`docs/demo/`](../demo/) — link them from
`README.md` rather than embedding directly.
