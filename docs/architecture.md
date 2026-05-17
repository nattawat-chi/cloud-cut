# CloudCut — System architecture

> Placeholder — fleshed out across Phases 1–5.

## High-level diagram

```
                     ┌─────────────┐
                     │  Browser    │ React 19 + Vite + shadcn/ui
                     └─────┬───────┘
              REST + Pusher │
                            ▼
                     ┌─────────────┐
                     │  Backend    │ Rust · Axum · JWT · SQLx
                     │  API        │
                     └──┬──────┬───┘
              SQL       │      │   enqueue
                        ▼      ▼
                ┌────────────┐ ┌──────────────┐
                │ PostgreSQL │ │ Redis Streams│
                └────────────┘ └──────┬───────┘
                                      │ XREADGROUP
                                      ▼
                              ┌──────────────┐
                              │ Worker (Rust)│ ── ffmpeg CLI
                              └──────┬───────┘
                                     │ PUT
                                     ▼
                              ┌──────────────┐
                              │ MinIO / R2   │
                              └──────────────┘
```

## Open questions (to resolve in later phases)

- Operation log retention vs. archive strategy (Phase 2 DESIGN.md)
- Pusher message budget vs. fallback transport (Phase 5)
- Render-export sharding for long videos (Phase 4)
