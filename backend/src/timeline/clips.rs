//! Clip CRUD + split + batch — editor+ on every mutation.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::require_role,
};

#[derive(Deserialize)]
pub struct CreateClipBody {
    pub track_id:    Uuid,
    pub asset_id:    Option<Uuid>,
    pub name:        String,
    pub pos_ms:      i64,
    pub dur_ms:      i64,
    #[serde(default)]
    pub trim_in_ms:  i64,
    #[serde(default)]
    pub trim_out_ms: i64,
}

/// POST /projects/:id/clips  — editor+
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateClipBody>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    if body.dur_ms < 400 {
        return Err(AppError::Validation("dur_ms must be >= 400".into()));
    }

    let clip_id: Uuid = sqlx::query_scalar(
        "INSERT INTO clips (track_id, asset_id, name, pos_ms, dur_ms, trim_in_ms, trim_out_ms) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(body.track_id)
    .bind(body.asset_id)
    .bind(&body.name)
    .bind(body.pos_ms)
    .bind(body.dur_ms)
    .bind(body.trim_in_ms)
    .bind(body.trim_out_ms)
    .fetch_one(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id":      clip_id,
            "trackId": body.track_id,
            "name":    body.name,
            "posMs":   body.pos_ms,
            "durMs":   body.dur_ms,
        })),
    ))
}

/// PATCH /projects/:id/clips/:clipId  — editor+
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, clip_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    let updated: Option<(Uuid, String, i64, i64)> = sqlx::query_as(
        "UPDATE clips \
         SET    pos_ms      = COALESCE($2, pos_ms), \
                dur_ms      = COALESCE($3, dur_ms), \
                trim_in_ms  = COALESCE($4, trim_in_ms), \
                trim_out_ms = COALESCE($5, trim_out_ms), \
                name        = COALESCE($6, name) \
         WHERE  id = $1 \
         RETURNING id, name, pos_ms, dur_ms",
    )
    .bind(clip_id)
    .bind(body["posMs"].as_i64())
    .bind(body["durMs"].as_i64())
    .bind(body["trimInMs"].as_i64())
    .bind(body["trimOutMs"].as_i64())
    .bind(body["name"].as_str())
    .fetch_optional(&state.db)
    .await?;

    let (id, name, pos_ms, dur_ms) =
        updated.ok_or_else(|| AppError::NotFound("clip".into()))?;

    Ok(Json(json!({ "id": id, "name": name, "posMs": pos_ms, "durMs": dur_ms })))
}

/// DELETE /projects/:id/clips/:clipId  — editor+
pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, clip_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    sqlx::query("DELETE FROM clips WHERE id = $1")
        .bind(clip_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /projects/:id/clips/:clipId/split  — editor+ (stub)
pub async fn split(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// POST /projects/:id/clips/batch  — editor+ (stub)
pub async fn batch(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}
