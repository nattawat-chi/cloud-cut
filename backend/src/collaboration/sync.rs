//! HTTP sync endpoint — offline reconnect (§4.5).
//!
//! GET /api/v1/projects/:id/operations?afterSeq=X
//!
//! Returns every operation_logs row with `id > afterSeq` for the project so
//! a client that just reconnected can replay missed events without reloading
//! the full project state.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::require_role,
};

use super::{
    dto::{OperationsQuery, OperationsResponse},
    operation_log,
};

/// Page size hard cap.  Clients that fall further behind must reload the
/// whole project state instead of paging through millions of ops.
const MAX_OPS_PER_PAGE: i64 = 500;

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
pub async fn list_operations(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Query(params): Query<OperationsQuery>,
) -> Result<Json<OperationsResponse>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Viewer).await?;

    let operations =
        operation_log::list_since(&state.db, project_id, params.after_seq, MAX_OPS_PER_PAGE).await?;

    let next_seq = operations
        .last()
        .map(|op| op.seq)
        .unwrap_or(params.after_seq);

    Ok(Json(OperationsResponse { operations, next_seq }))
}
