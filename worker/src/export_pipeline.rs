#![allow(dead_code)] // Phase 4 wires the real render loop.
//! Export pipeline (§3.6 / §3.7).
//!
//! Minimum behaviour per §3.7:
//!   1. load timeline from PostgreSQL
//!   2. select main video track
//!   3. order clips by `track_position_ms`
//!   4. trim each source by `in_point_ms` / `out_point_ms` → `segment_NNN.mp4`
//!   5. concatenate segments
//!   6. encode MP4
//!   7. upload output
//!   8. update export job progress
//!   9. return download URL
//!
//! On terminal status (done / error / cancelled) the worker must call
//! `backend::rate_limit::release_export_slot` (or equivalent direct DECR) to
//! free the concurrent-export slot taken by the API.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::WorkerResult;

pub async fn render(db: &PgPool, project_id: Uuid, export_id: Uuid) -> WorkerResult<()> {
    let _ = (db, project_id, export_id);
    // TODO: implement the 9-step pipeline above.
    Ok(())
}
