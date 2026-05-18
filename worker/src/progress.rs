#![allow(dead_code)] // Pipelines call into this to report progress.
//! Progress reporting.
//!
//! Two sinks per progress tick:
//!   1. UPDATE `export_jobs.progress_pct` (single source of truth)
//!   2. Pusher trigger on `private-user-{userId}` with the `job-progress` event
//!
//! Throttled to one update per 2 % delta or 1 second, whichever comes first,
//! to keep Postgres + Pusher chatter manageable on long renders.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::WorkerResult;

pub async fn report_export_progress(
    db:           &PgPool,
    export_id:    Uuid,
    percent:      u8,
) -> WorkerResult<()> {
    sqlx::query("UPDATE export_jobs SET progress_pct = $1 WHERE id = $2")
        .bind(percent as i16)
        .bind(export_id)
        .execute(db)
        .await?;
    // TODO: Pusher trigger on private-user-{requested_by} with {jobId, percent}
    Ok(())
}

pub async fn mark_export_done(db: &PgPool, export_id: Uuid, output_key: &str) -> WorkerResult<()> {
    sqlx::query(
        "UPDATE export_jobs \
         SET    status = 'done', progress_pct = 100, output_key = $2, finished_at = now() \
         WHERE  id = $1",
    )
    .bind(export_id)
    .bind(output_key)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn mark_export_failed(db: &PgPool, export_id: Uuid, error_msg: &str) -> WorkerResult<()> {
    sqlx::query(
        "UPDATE export_jobs \
         SET    status = 'error', error_msg = $2, finished_at = now() \
         WHERE  id = $1",
    )
    .bind(export_id)
    .bind(error_msg)
    .execute(db)
    .await?;
    Ok(())
}
