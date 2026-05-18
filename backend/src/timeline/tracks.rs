//! Track CRUD — editor+ on every mutation.

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
pub struct CreateTrackBody {
    pub kind:  String,
    pub name:  String,
    #[serde(default)]
    pub order: i16,
}

/// POST /projects/:id/tracks  — editor+
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateTrackBody>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    if !matches!(body.kind.as_str(), "video" | "audio" | "subtitle") {
        return Err(AppError::Validation("kind must be video | audio | subtitle".into()));
    }

    let track_id: Uuid = sqlx::query_scalar(
        "INSERT INTO tracks (project_id, kind, name, position) \
         VALUES ($1, $2::track_kind, $3, $4) RETURNING id",
    )
    .bind(project_id)
    .bind(&body.kind)
    .bind(&body.name)
    .bind(body.order)
    .fetch_one(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id":        track_id,
            "projectId": project_id,
            "kind":      body.kind,
            "name":      body.name,
        })),
    ))
}

/// PATCH /projects/:id/tracks/:trackId  — editor+ (stub)
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _track_id)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/tracks/:trackId  — editor+
pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, track_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    sqlx::query("DELETE FROM tracks WHERE id = $1 AND project_id = $2")
        .bind(track_id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
