#![allow(dead_code)] // Wired by daily cron + the CleanupExpiredFiles job kind.
//! Scheduled cleanup job (§3.12).
//!
//! 1. delete soft-deleted projects older than 30 days
//! 2. delete export files whose `expires_at < now`
//! 3. delete orphaned assets unused for 7+ days
//! 4. delete accounts whose `deleted_at > 90 days`
//! 5. log summary JSON

use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::WorkerResult;

#[derive(Debug, Serialize)]
pub struct CleanupSummary {
    pub deleted_projects: i64,
    pub deleted_assets:   i64,
    pub deleted_exports:  i64,
    pub freed_bytes:      i64,
}

pub async fn run(db: &PgPool, run_id: Uuid) -> WorkerResult<()> {
    let _ = (db, run_id);
    let summary = CleanupSummary { deleted_projects: 0, deleted_assets: 0, deleted_exports: 0, freed_bytes: 0 };
    tracing::info!(?summary, "cleanup run (stub)");
    Ok(())
}
