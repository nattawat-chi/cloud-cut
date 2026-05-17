# CloudCut — Database design

> Placeholder — Phase 2 fills this in with table specs, indexes with rationale,
> storage estimates, partitioning strategy for `operation_logs`, and the
> answers to the eight DESIGN questions in the test brief (section 1.4).

## Entity overview

```
users ─┐
       ├─< workspace_members >── workspaces ──< projects ──< tracks ──< clips ──< clip_effects
       │                                  │                       │
       │                                  ├──< assets ─< asset_variants
       │                                  ├──< transitions
       │                                  ├──< text_overlays
       │                                  ├──< export_jobs
       │                                  └──< operation_logs
       └──< invitations
```

Storage estimates, soft-delete policy, and partition strategy land here in Phase 2.
