#![allow(dead_code)] // `BroadcastOperation` is wired by Pusher trigger (Phase 5).
//! Request / response payloads for the collaboration module.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

// ─── Sync (GET /projects/:id/operations) ──────────────────────────────────────

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct OperationsQuery {
    /// Exclusive lower bound: return ops with seq > afterSeq.
    /// Defaults to 0 — returns all operations for the project.
    #[serde(rename = "afterSeq", default)]
    #[param(rename = "afterSeq")]
    pub after_seq: i64,
}

#[derive(Serialize, ToSchema)]
pub struct OperationEntry {
    pub seq: i64,
    #[serde(rename = "userId")]
    pub user_id: Uuid,
    #[serde(rename = "type")]
    pub op_type: String,
    /// Full before+after state for undo/redo replay.
    #[schema(value_type = Object)]
    pub payload: Value,
    #[serde(rename = "appliedAt")]
    pub applied_at: DateTime<Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct OperationsResponse {
    pub operations: Vec<OperationEntry>,
    /// Pass this value as `afterSeq` on the next reconnect call.
    #[serde(rename = "nextSeq")]
    pub next_seq: i64,
}

// ─── Pusher broadcast payload  (Phase 5) ──────────────────────────────────────

/// Wire format for the `operation` event broadcast on
/// `private-project-{projectId}`.  Mirrors §4.2 of the spec.
#[derive(Serialize, ToSchema)]
pub struct BroadcastOperation {
    #[serde(rename = "operationId")]
    pub operation_id: Uuid,
    #[serde(rename = "type")]
    pub op_type: String,
    #[serde(rename = "projectId")]
    pub project_id: Uuid,
    #[serde(rename = "userId")]
    pub user_id: Uuid,
    #[serde(rename = "serverSeq")]
    pub server_seq: i64,
    #[schema(value_type = Object)]
    pub payload: Value,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}
