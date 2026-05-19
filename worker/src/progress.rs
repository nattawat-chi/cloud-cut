//! Progress reporting — helpers to push job progress back to the database.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::WorkerError;

/// Update the `progress_pct` column on an asset row.
#[allow(dead_code)]
pub async fn update_asset_progress(db: &PgPool, asset_id: Uuid, pct: i16) -> Result<(), WorkerError> {
    sqlx::query("UPDATE assets SET progress_pct = $1 WHERE id = $2")
        .bind(pct)
        .bind(asset_id)
        .execute(db)
        .await?;
    Ok(())
}

/// Update the `progress_pct` column on an export_job row.
#[allow(dead_code)]
pub async fn update_job_progress(db: &PgPool, job_id: Uuid, pct: i16) -> Result<(), WorkerError> {
    sqlx::query("UPDATE export_jobs SET progress_pct = $1 WHERE id = $2")
        .bind(pct)
        .bind(job_id)
        .execute(db)
        .await?;
    Ok(())
}
