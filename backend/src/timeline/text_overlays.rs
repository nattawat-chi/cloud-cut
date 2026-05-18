//! Text-overlay CRUD — editor+ on every mutation.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::require_role,
};

/// POST /projects/:id/text-overlays  — editor+ (stub)
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// PATCH /projects/:id/text-overlays/:overlayId  — editor+ (stub)
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _oid)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/text-overlays/:overlayId  — editor+
pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, overlay_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    sqlx::query("DELETE FROM text_overlays WHERE id = $1 AND project_id = $2")
        .bind(overlay_id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
