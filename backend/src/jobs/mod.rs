#![allow(dead_code)] // Scaffold — wired when timeline mutations enqueue work.
//! Job queue — producer-side interface.
//!
//! The API process never runs ffmpeg; it just enqueues jobs that the
//! `worker` binary consumes from Redis Streams.  Job payload shapes mirror
//! §3.3 of the spec.
//!
//! Phase 4 will wire the real `XADD` call against
//! `cloudcut:jobs` stream and add per-job retry / idempotency-key handling.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

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

/// Producer handle over Redis Streams.  Stub.
#[derive(Clone)]
pub struct JobQueue {
    redis: redis::aio::ConnectionManager,
}

impl JobQueue {
    pub fn new(redis: redis::aio::ConnectionManager) -> Self {
        Self { redis }
    }

    /// Enqueue one job onto `cloudcut:jobs`.  Stub — Phase 4 wires `XADD`.
    pub async fn enqueue(&self, _payload: &JobPayload) -> Result<String, AppError> {
        // TODO: XADD cloudcut:jobs * payload <json> idempotency_key <key>
        Ok("stub-message-id".into())
    }
}
