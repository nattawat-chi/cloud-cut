//! Offline-reconnect sync endpoint (§4.5).
//!
//! Clients persist the highest `serverSeq` they've applied locally.  After a
//! Pusher reconnect they hit
//!
//!     GET /api/v1/projects/:id/operations?afterSeq=X
//!
//! to replay any rows they missed while disconnected.  Results are capped at
//! 500 ops per page; if the gap is bigger the client should reload the full
//! project state instead of paging.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    collaboration::models::{OperationEntry, OperationsQuery, OperationsResponse},
    error::AppError,
    state::AppState,
    workspaces::authz::{require_project_role, Role},
};

const MAX_OPS_PER_PAGE: i64 = 500;

#[utoipa::path(
    get,
    path = "/api/v1/projects/{id}/operations",
    params(
        ("id" = Uuid, Path, description = "Project UUID"),
        OperationsQuery,
    ),
    responses(
        (status = 200, description = "Operations with seq > afterSeq, ordered ASC", body = OperationsResponse),
        (status = 403, description = "Not a workspace member"),
        (status = 404, description = "Project not found or archived"),
    ),
    security(("bearer_auth" = [])),
    tag = "collaboration",
)]
pub async fn list_operations(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Query(q): Query<OperationsQuery>,
) -> Result<Json<OperationsResponse>, AppError> {
    require_project_role(&state, project_id, auth.user_id, Role::Viewer).await?;

    let operations = sqlx::query_as::<_, OperationEntry>(
        r#"
        SELECT id          AS seq,
               user_id,
               op_type,
               payload,
               applied_at
        FROM   operation_logs
        WHERE  project_id = $1
          AND  id         > $2
        ORDER  BY id ASC
        LIMIT  $3
        "#,
    )
    .bind(project_id)
    .bind(q.after_seq)
    .bind(MAX_OPS_PER_PAGE)
    .fetch_all(&state.db)
    .await?;

    let next_seq = operations
        .last()
        .map(|op| op.seq)
        .unwrap_or(q.after_seq);

    Ok(Json(OperationsResponse { operations, next_seq }))
}
