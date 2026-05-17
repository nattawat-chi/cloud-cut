# Backend — Design notes

## Database layer (Phase 2 — complete)

Schema lives in `migrations/`. Full rationale in [`docs/database-design.md`](../docs/database-design.md).

Key decisions relevant to the Rust layer:

- **UUID PKs** generated with `gen_random_uuid()` in Postgres — Rust code can also pre-generate them with `uuid::Uuid::new_v4()` for optimistic inserts.
- `operation_logs` has no FK to `projects` — the Axum handler validates project existence before inserting.
- `clip_effects.position` is the render order — the export handler must `ORDER BY position` when building the ffmpeg filter-graph.
- Migrations are run via `sqlx migrate run`; seed is guarded by `CLOUDCUT_SEED_DATA=true`.

## API layer (Phase 3 — pending)

> The brief (section 2.7) requires answering:
>
> 1. Why Axum vs. Actix?
> 2. Why SQLx vs. SeaORM?
> 3. How does cursor-based pagination work?
> 4. Presigned upload flow walkthrough
> 5. Why not upload through the backend?
> 6. Batch clip operations: atomic vs. partial success?
> 7. API versioning strategy
> 8. Where does authorization live? (middleware / extractor / service)
> 9. Error-handling strategy
