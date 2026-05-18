//! Collaboration sync endpoint.
//!
//! Clients call GET /projects/:id/operations?afterSeq=X after a reconnect to
//! replay any operations they missed while offline.  The `id` column in
//! operation_logs is a monotonically increasing BIGSERIAL that acts as the
//! global sequence number for a project.

use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::require_role,
};

// ─── DTOs ──────────────────────────────────────────────────────────────────────

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

// ─── Handler ───────────────────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/projects/{id}/operations",
    params(
        ("id" = Uuid, Path, description = "Project UUID"),
        OperationsQuery,
    ),
    responses(
        (status = 200, description = "Operations since afterSeq, ordered by seq ASC", body = OperationsResponse),
        (status = 403, description = "Not a workspace member"),
        (status = 404, description = "Project not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "collaboration"
)]
/// GET /projects/:id/operations?afterSeq=X
///
/// Authorization: viewer+ (read-only; any workspace member may catch up).
/// Returns at most 500 operations ordered by seq ASC.
pub async fn list_operations(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Query(params): Query<OperationsQuery>,
) -> Result<Json<OperationsResponse>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Viewer).await?;

    let rows: Vec<(i64, Uuid, String, Value, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT id, user_id, op_type, payload, applied_at
        FROM   operation_logs
        WHERE  project_id = $1
          AND  id         > $2
        ORDER  BY id ASC
        LIMIT  500
        "#,
    )
    .bind(project_id)
    .bind(params.after_seq)
    .fetch_all(&state.db)
    .await?;

    let next_seq = rows.last().map(|(id, ..)| *id).unwrap_or(params.after_seq);

    let operations = rows
        .into_iter()
        .map(|(seq, user_id, op_type, payload, applied_at)| OperationEntry {
            seq,
            user_id,
            op_type,
            payload,
            applied_at,
        })
        .collect();

    Ok(Json(OperationsResponse { operations, next_seq }))
}

// ─── Router ────────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/:id/operations", get(list_operations))
}
