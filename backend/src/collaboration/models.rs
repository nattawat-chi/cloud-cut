use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

/// Query string for `GET /api/v1/projects/:id/operations`.
///
/// `afterSeq` is the exclusive lower bound on the per-project server sequence
/// (the BIGSERIAL `id` column of `operation_logs`).  Defaults to 0 so a fresh
/// client gets the full log.
#[derive(Debug, Deserialize)]
pub struct OperationsQuery {
    #[serde(rename = "afterSeq", default)]
    pub after_seq: i64,
}

/// One row of `operation_logs` shaped for the wire.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OperationEntry {
    /// Per-project server sequence (BIGSERIAL `id`).
    pub seq: i64,
    #[serde(rename = "userId")]
    pub user_id: Uuid,
    #[serde(rename = "type")]
    pub op_type: String,
    /// Full before+after state for undo/redo replay.
    pub payload: Value,
    #[serde(rename = "appliedAt")]
    pub applied_at: DateTime<Utc>,
}

/// Response envelope.
///
/// `nextSeq` is the highest `seq` in `operations`.  When the response is
/// empty it equals the request's `afterSeq` so the client can keep polling
/// from the same point without going backwards.
#[derive(Debug, Serialize)]
pub struct OperationsResponse {
    pub operations: Vec<OperationEntry>,
    #[serde(rename = "nextSeq")]
    pub next_seq: i64,
}
