//! Clip-effect CRUD + reorder — editor+ on every mutation.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
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

/// POST /projects/:id/clips/:clipId/effects  — editor+
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, clip_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    let effect_type = body["type"]
        .as_str()
        .ok_or_else(|| AppError::Validation("type required".into()))?;
    let value = body["value"].as_f64().unwrap_or(0.0);

    let effect_id: Uuid = sqlx::query_scalar(
        "INSERT INTO clip_effects (clip_id, type, value) \
         VALUES ($1, $2::effect_type, $3) RETURNING id",
    )
    .bind(clip_id)
    .bind(effect_type)
    .bind(value)
    .fetch_one(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id":     effect_id,
            "clipId": clip_id,
            "type":   effect_type,
            "value":  value,
        })),
    ))
}

/// PATCH /projects/:id/clips/:clipId/effects/:effectId  — editor+ (stub)
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id, _effect_id)): Path<(Uuid, Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/clips/:clipId/effects/:effectId  — editor+
pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id, effect_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    sqlx::query("DELETE FROM clip_effects WHERE id = $1")
        .bind(effect_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /projects/:id/clips/:clipId/effects/reorder  — editor+ (stub)
pub async fn reorder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}
