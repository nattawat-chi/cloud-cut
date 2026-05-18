use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::require_role,
};

/// GET /exports/:id  — viewer+ (derive project from export job)
pub async fn get_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(export_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let row: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT project_id, status::text FROM export_jobs WHERE id = $1",
    )
    .bind(export_id)
    .fetch_optional(&state.db)
    .await?;

    let (project_id, status) = row.ok_or_else(|| AppError::NotFound("export job".into()))?;
    require_role(&state.db, auth.user_id, project_id, Role::Viewer).await?;

    Ok(Json(json!({ "id": export_id, "projectId": project_id, "status": status })))
}

/// DELETE /exports/:id  — editor+ (cancel export)
pub async fn cancel_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(export_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let project_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT project_id FROM export_jobs WHERE id = $1",
    )
    .bind(export_id)
    .fetch_optional(&state.db)
    .await?;

    let project_id = project_id.ok_or_else(|| AppError::NotFound("export job".into()))?;
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    sqlx::query(
        "UPDATE export_jobs SET status = 'error', error_msg = 'cancelled' WHERE id = $1",
    )
    .bind(export_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/exports/:id", get(get_export).delete(cancel_export))
}
