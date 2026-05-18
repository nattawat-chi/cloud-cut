# CloudCut — Collaboration design

Answers the 8 questions in spec §4.8. Implementation lives in
[`backend/src/pusher/`](../backend/src/pusher/) (channel-auth signing +
REST trigger) and [`frontend/src/components/collaboration/CollabClient.tsx`](../frontend/src/components/collaboration/CollabClient.tsx)
(`pusher-js` subscription + remote-op apply).

---

## Q1 — Why Pusher?

Spec mandate first. Even setting that aside:

- **Presence + channel auth + WebSocket transport in one product** — building
  the same on raw WebSocket + Redis pub/sub would take a week before getting
  anything an editor reviewer would see.
- **Hosted reliability + fallback transports** (long-polling, SSE) for users
  behind aggressive corporate proxies — the dev would have to write zero of it.
- **HMAC-signed channel auth fits perfectly into the existing JWT flow**
  — backend signs `socket_id:channel:user_data` with `PUSHER_SECRET`, the
  client's `authEndpoint` calls our `/api/v1/pusher/auth` with its access
  token, no separate auth model.

Trade-off in §4.8 Q6 below: cost at scale + vendor lock-in. Mitigated by
throttling client events and putting Pusher behind a thin `CollabClient`
wrapper that can be swapped for Soketi (drop-in self-hosted protocol clone)
without touching anything else in the codebase.

## Q2 — Client events vs server events

Two distinct kinds of traffic share the same presence channel:

| Source | Convention | Trust | Use |
|---|---|---|---|
| Server-broadcast | `event:name` (e.g. `clip:updated`) | authoritative — DB has already persisted | apply to projectStore on the receiver |
| Client-broadcast | `client-event:name` (Pusher namespace) | ephemeral, peer-to-peer, NOT persisted | cursor jitter, "is typing" hints |

Server events are the ones we use today — every `clip:added` / `clip:updated`
/ `clip:deleted` is fired from `backend/src/timeline/handlers.rs` *after* the
DB transaction commits and the operation log row lands. They are guaranteed
to match a future `GET /projects/:id/timeline` hydration.

Client events would carry cursor positions in a future iteration: high
volume, low value if missed, never persisted. Pusher rate-limits them
separately (default 100/s/channel) so cursor floods can't crowd out the
real-state events.

## Q3 — Cursor movement throttle

**60 ms** at the emitter (≈16 broadcasts per second per editor). Reasoning:

- 60 fps native cursor motion would publish 60 events/s. Pusher's default
  per-channel client-event quota is 100/s — three concurrent editors blow
  past that.
- Human eye stops resolving "smooth" around 24 fps. 16 fps with
  `transition: transform 60ms linear` on the receiver looks indistinguishable
  from continuous motion.
- The throttle lives in the *emitter* (one `useThrottle(60)` wrap) not the
  receiver, so the wire actually carries fewer bytes — Pusher bills on
  message count.

Not implemented in the current build — Phase 5 stops at presence + op sync.
The cursor `ViewportCursors` component is still hard-coded to scripted
positions from when CollabSimulator drove it; the swap to live cursors is a
~30-line follow-up.

## Q4 — Offline reconnect

```
Disconnect detected (pusher-js fires `pusher:connection:state_change`)
  ↓
projectStore.lastServerSeq is the high-watermark
  ↓
On reconnect:
  GET /api/v1/projects/:id/operations?afterSeq={lastServerSeq}
  ↓
Backend returns rows from operation_logs where server_seq > X
  ↓
Client replays ops in order through applyRemoteClipUpsert / applyRemoteClipDelete
  ↓
If returned row count >= MAX_REPLAY (e.g. 500):
  fall back to full GET /projects/:id/timeline rehydrate
  (cheaper than replaying thousands of ops, and our timeline snapshot
  endpoint is already optimised for this)
```

Schema already supports it: `operation_logs.server_seq` is a `BIGSERIAL`
defined in `0001_init.sql`. The endpoint itself isn't shipped yet — flagged
as known limitation in DEV_LOG. Once the endpoint lands the client just
needs to track `lastServerSeq` and call it on `pusher:connection:state_change
→ connected` transitions.

## Q5 — OperationLog and missed events

`operation_logs` is append-only with a monotonically increasing
`server_seq`. Every mutation in `backend/src/timeline/handlers.rs` writes a
row inside the same transaction as the data change — so the log is a
guaranteed-complete journal of every change a project has ever seen.

Pusher gives no delivery guarantees for client → channel events (and
even for trigger events, can drop on network flake). The log is the
fallback: when a client suspects it missed something (reconnect, timeout,
or just paranoia after a long idle) it asks `GET /operations?afterSeq=X`
and rebuilds local state. Pusher becomes a latency optimisation; the log
is correctness.

This is also why the schema partitions `operation_logs` by month
(see `docs/database-design.md` Q4) — the log is going to be the
largest table and a partition pruner keeps replay queries fast.

## Q6 — Beyond the Pusher limit

Pusher's "Sandbox" plan caps at 100 concurrent connections and 200k
messages/day. CloudCut at scale (call it 10k MAU, 5% online during
business hours = 500 concurrent, 30 ops/min/user → 15 msg/s sustained) hits
the wall around the Startup tier (~$49/mo for 500 connections).

Migration options ranked by switching cost:

1. **Soketi** (open-source Pusher-protocol server) — same wire protocol,
   same `pusher-js` client. We change `PUSHER_*` env vars to point at our
   self-hosted box; no code changes. Trade cost for self-hosting ops.
2. **Ably** — different protocol but similar shape (channels + presence).
   `CollabClient.tsx` is the only file that knows about `pusher-js`; swap
   for `ably` SDK behind the same `subscribe(projectId)` interface. ~1
   day of work.
3. **Self-host on NATS JetStream + custom WS gateway** — cheapest at scale,
   highest engineering cost. Only worth it past ~50k concurrent.

The `CollabClient` boundary is deliberately thin (~100 lines) for exactly
this reason.

## Q7 — Why no full CRDT in this scope

CloudCut's mutations don't actually conflict at granularity where CRDT
buys anything:

- **Clip position** — last-write-wins by `server_seq` is what a user expects.
  "Two editors moved the same clip" is rare; when it happens, accepting the
  later move and showing a toast is a perfectly acceptable UX.
- **Clip effects** — different effects on the same clip merge naturally
  (brightness + saturation slider don't fight). Two edits to the *same*
  effect's value: again LWW is fine.
- **Tracks / timeline structure** — splits + deletes are coordination-heavy
  but rare. Backend transaction guarantees atomicity per-op.

A full CRDT (LSEQ for timeline order, LWW-Map for clip props, custom
Yjs `Y.Doc` for text overlays) would add ~5 kB of WebAssembly to every
client, ~3-week project to integrate cleanly, and the only correctness
win is "no toast on a near-simultaneous edit." Wrong trade for a
3–5-day take-home.

The architecture *can* accept CRDT later because we already separated
local op application (`projectStore` setters) from network application
(`applyRemoteClipUpsert`) — the second one becomes "apply CRDT delta"
in a Yjs world.

## Q8 — Designing with Yjs / Automerge

If we ever need true conflict-free editing (e.g. for collaborative
text-overlay typing where keystroke-level merge matters), the path is:

```
ProjectStore
  ├── tracks      → Y.Array<Y.Map<TrackProps>>
  ├── clips       → Y.Array<Y.Map<ClipProps>>      // each clip a Y.Map
  ├── effects     → Y.Map<clipId, Y.Array<Y.Map>>
  └── overlays    → Y.Array<Y.Map<{content: Y.Text, …}>>
                                      ↑
                                      Y.Text gets keystroke-level CRDT
```

Transport: Pusher `binary_message` carries `Y.encodeStateAsUpdate` deltas.
Receivers `Y.applyUpdate` to merge. Backend would skip op-by-op REST and
instead persist the whole Y.Doc as a binary blob in `projects.yjs_state`,
re-snapshotted on idle.

Backend still issues authoritative ops for sensitive fields (`asset_id`
swap, `track_id` change for permission reasons) by writing to the Y.Doc
server-side and broadcasting the resulting update — that gives us both
CRDT consistency *and* server-side validation.

Automerge alternative: same shape but binary updates are smaller (cleaner
storage) and Rust support is first-class (`automerge` crate ships
identical wire format), so we could implement *server-authored merges*
in the existing Axum process without spinning up a Node sidecar.

The reason this is a future call, not a now call: we don't yet have a
real CRDT-shaped feature (collaborative text). Once `TextOverlay`
content gains keystroke-level editing, that's the moment to migrate.
Until then the `operation_logs` model gives us the audit trail Yjs
deliberately doesn't preserve.

---

## What's actually implemented vs documented

| Feature | In code | In this doc |
|---|:---:|:---:|
| Pusher channel auth (HMAC-SHA256) | ✅ `backend/src/pusher/client.rs::sign_presence` | ✅ |
| REST event trigger from backend | ✅ `backend/src/pusher/client.rs::trigger` | ✅ |
| `clip:added` / `clip:updated` / `clip:deleted` broadcast | ✅ `backend/src/timeline/handlers.rs` | ✅ |
| Frontend `pusher-js` subscribe + presence | ✅ `CollabClient.tsx::useRealtime` | ✅ |
| Echo suppression on own ops | ✅ `isOwnAction(payload.actor)` | ✅ |
| Remote-apply without API roundtrip | ✅ `applyRemoteClipUpsert` / `applyRemoteClipDelete` | ✅ |
| Live cursor broadcast (`client-cursor-move`) | ❌ scripted positions only | Q3 |
| `GET /operations?afterSeq=X` for offline reconnect | ❌ schema ready, endpoint not shipped | Q4 |
| Conflict toast on overwrite | ❌ | Q7 |
| Yjs / Automerge | ❌ deliberately out of scope | Q8 |
