#![allow(dead_code)] // Phase 4 wires dispatch + idempotency check.
//! Dispatches a deserialised [`JobPayload`] into the right pipeline.
//!
//! Mirrors `backend::jobs::JobPayload` exactly — the two crates can't share a
//! type without a third workspace crate, so the shape is duplicated and a
//! `cargo test` in CI should fail-fast on drift.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    asset_pipeline, cleanup, error::WorkerResult, export_pipeline, queue::QueuedJob,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum JobPayload {
    ExtractMetadata     { asset_id: Uuid, input_key: String, idempotency_key: String },
    GenerateProxy       { asset_id: Uuid, input_key: String, idempotency_key: String },
    GenerateThumbnails  { asset_id: Uuid, input_key: String, idempotency_key: String },
    ExtractWaveform     { asset_id: Uuid, input_key: String, idempotency_key: String },
    RenderExport        { export_id: Uuid, project_id: Uuid, idempotency_key: String },
    CleanupExpiredFiles { run_id: Uuid },
}

pub async fn dispatch(db: &PgPool, job: &QueuedJob) -> WorkerResult<()> {
    let payload: JobPayload = serde_json::from_str(&job.payload_json)?;

    match payload {
        JobPayload::ExtractMetadata    { asset_id, input_key, .. } =>
            asset_pipeline::extract_metadata(db, asset_id, &input_key).await,
        JobPayload::GenerateProxy      { asset_id, input_key, .. } =>
            asset_pipeline::generate_proxy(db, asset_id, &input_key).await,
        JobPayload::GenerateThumbnails { asset_id, input_key, .. } =>
            asset_pipeline::generate_thumbnails(db, asset_id, &input_key).await,
        JobPayload::ExtractWaveform    { asset_id, input_key, .. } =>
            asset_pipeline::extract_waveform(db, asset_id, &input_key).await,
        JobPayload::RenderExport       { export_id, project_id, .. } =>
            export_pipeline::render(db, project_id, export_id).await,
        JobPayload::CleanupExpiredFiles { run_id } =>
            cleanup::run(db, run_id).await,
    }
}
