use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::{require_role, require_workspace_role},
};

// ─── Project DTOs ──────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
pub struct CreateProjectBody {
    pub workspace_id: Uuid,
    pub name:         String,
    #[serde(default)]
    pub description:  String,
}

#[derive(Deserialize, IntoParams)]
pub struct ListProjectsQuery {
    /// Filter by workspace UUID.
    #[serde(rename = "workspaceId")]
    pub workspace_id: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateProjectBody {
    pub name:        Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct ProjectPayload {
    pub id:           Uuid,
    pub workspace_id: Uuid,
    pub name:         String,
    pub description:  String,
}

// ─── Project handlers ──────────────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/projects",
    request_body = CreateProjectBody,
    responses(
        (status = 201, description = "Project created", body = ProjectPayload),
        (status = 403, description = "Insufficient role — editor+ required"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects"
)]
/// POST /projects  — editor+ in the target workspace
pub async fn create_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateProjectBody>,
) -> Result<(StatusCode, Json<ProjectPayload>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    require_workspace_role(&state.db, auth.user_id, body.workspace_id, Role::Editor).await?;

    let (id, name, description, workspace_id): (Uuid, String, String, Uuid) =
        sqlx::query_as(
            "INSERT INTO projects (workspace_id, name, description, created_by) \
             VALUES ($1, $2, $3, $4) \
             RETURNING id, name, description, workspace_id",
        )
        .bind(body.workspace_id)
        .bind(&body.name)
        .bind(&body.description)
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;

    Ok((StatusCode::CREATED, Json(ProjectPayload { id, workspace_id, name, description })))
}

#[utoipa::path(
    get,
    path = "/api/v1/projects",
    params(ListProjectsQuery),
    responses(
        (status = 200, description = "Projects in the workspace", body = Vec<ProjectPayload>),
        (status = 403, description = "Not a workspace member"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects"
)]
/// GET /projects?workspaceId=X  — viewer+ in the workspace
pub async fn list_projects(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<ListProjectsQuery>,
) -> Result<Json<Vec<ProjectPayload>>, AppError> {
    require_workspace_role(&state.db, auth.user_id, q.workspace_id, Role::Viewer).await?;

    let rows: Vec<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "SELECT id, workspace_id, name, description \
         FROM   projects \
         WHERE  workspace_id = $1 AND archived = false \
         ORDER  BY updated_at DESC",
    )
    .bind(q.workspace_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, workspace_id, name, description)| ProjectPayload {
                id,
                workspace_id,
                name,
                description,
            })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/projects/{id}",
    params(("id" = Uuid, Path, description = "Project UUID")),
    responses(
        (status = 200, description = "Project detail", body = ProjectPayload),
        (status = 404, description = "Project not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects"
)]
/// GET /projects/:id  — viewer+
pub async fn get_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ProjectPayload>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Viewer).await?;

    let row: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "SELECT id, workspace_id, name, description FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;

    let (id, workspace_id, name, description) =
        row.ok_or_else(|| AppError::NotFound("project".into()))?;

    Ok(Json(ProjectPayload { id, workspace_id, name, description }))
}

#[utoipa::path(
    patch,
    path = "/api/v1/projects/{id}",
    params(("id" = Uuid, Path, description = "Project UUID")),
    request_body = UpdateProjectBody,
    responses(
        (status = 200, description = "Updated project", body = ProjectPayload),
        (status = 403, description = "Insufficient role — editor+ required"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects"
)]
/// PATCH /projects/:id  — editor+
pub async fn update_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(body): Json<UpdateProjectBody>,
) -> Result<Json<ProjectPayload>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    let row: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "UPDATE projects \
         SET    name        = COALESCE($2, name), \
                description = COALESCE($3, description) \
         WHERE  id = $1 \
         RETURNING id, workspace_id, name, description",
    )
    .bind(project_id)
    .bind(&body.name)
    .bind(&body.description)
    .fetch_optional(&state.db)
    .await?;

    let (id, workspace_id, name, description) =
        row.ok_or_else(|| AppError::NotFound("project".into()))?;

    Ok(Json(ProjectPayload { id, workspace_id, name, description }))
}

#[utoipa::path(
    delete,
    path = "/api/v1/projects/{id}",
    params(("id" = Uuid, Path, description = "Project UUID")),
    responses(
        (status = 204, description = "Project archived"),
        (status = 403, description = "Insufficient role — admin+ required"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects"
)]
/// DELETE /projects/:id  — admin+
pub async fn delete_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Admin).await?;

    sqlx::query("UPDATE projects SET archived = true WHERE id = $1")
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /projects/:id/duplicate  — editor+  (stub)
pub async fn duplicate_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

// ─── Track handlers  (editor+ on all mutations) ────────────────────────────────

#[derive(Deserialize)]
pub struct CreateTrackBody {
    pub kind:  String,
    pub name:  String,
    #[serde(default)]
    pub order: i16,
}

/// POST /projects/:id/tracks  — editor+
pub async fn create_track(
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

    Ok((StatusCode::CREATED, Json(json!({ "id": track_id, "projectId": project_id, "kind": body.kind, "name": body.name }))))
}

/// PATCH /projects/:id/tracks/:trackId  — editor+
pub async fn update_track(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _track_id)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/tracks/:trackId  — editor+
pub async fn delete_track(
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

// ─── Clip handlers  (editor+ on all mutations) ─────────────────────────────────

#[derive(Deserialize)]
pub struct CreateClipBody {
    pub track_id:  Uuid,
    pub asset_id:  Option<Uuid>,
    pub name:      String,
    pub pos_ms:    i64,
    pub dur_ms:    i64,
    #[serde(default)]
    pub trim_in_ms:  i64,
    #[serde(default)]
    pub trim_out_ms: i64,
}

/// POST /projects/:id/clips  — editor+
pub async fn create_clip(
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
            "id":       clip_id,
            "trackId":  body.track_id,
            "name":     body.name,
            "posMs":    body.pos_ms,
            "durMs":    body.dur_ms,
        })),
    ))
}

/// PATCH /projects/:id/clips/:clipId  — editor+
pub async fn update_clip(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, clip_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    // Partial update: only fields present in body are written.
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
pub async fn delete_clip(
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

/// POST /projects/:id/clips/:clipId/split  — editor+  (stub)
pub async fn split_clip(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// POST /projects/:id/clips/batch  — editor+  (stub)
pub async fn batch_clips(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

// ─── Effect handlers  (editor+) ────────────────────────────────────────────────

/// POST /projects/:id/clips/:clipId/effects  — editor+
pub async fn create_effect(
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

    Ok((StatusCode::CREATED, Json(json!({ "id": effect_id, "clipId": clip_id, "type": effect_type, "value": value }))))
}

/// PATCH /projects/:id/clips/:clipId/effects/:effectId  — editor+  (stub)
pub async fn update_effect(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id, _effect_id)): Path<(Uuid, Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/clips/:clipId/effects/:effectId  — editor+
pub async fn delete_effect(
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

/// PATCH /projects/:id/clips/:clipId/effects/reorder  — editor+  (stub)
pub async fn reorder_effects(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _clip_id)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

// ─── Transition handlers  (editor+) ────────────────────────────────────────────

/// POST /projects/:id/transitions  — editor+  (stub)
pub async fn create_transition(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// PATCH /projects/:id/transitions/:transitionId  — editor+  (stub)
pub async fn update_transition(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _tid)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/transitions/:transitionId  — editor+  (stub)
pub async fn delete_transition(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, transition_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    sqlx::query("DELETE FROM transitions WHERE id = $1 AND project_id = $2")
        .bind(transition_id)
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Text-overlay handlers  (editor+) ─────────────────────────────────────────

/// POST /projects/:id/text-overlays  — editor+  (stub)
pub async fn create_text_overlay(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// PATCH /projects/:id/text-overlays/:overlayId  — editor+  (stub)
pub async fn update_text_overlay(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((project_id, _oid)): Path<(Uuid, Uuid)>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /projects/:id/text-overlays/:overlayId  — editor+  (stub)
pub async fn delete_text_overlay(
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

// ─── Export sub-routes  (under /projects/:id/exports) ─────────────────────────

/// POST /projects/:id/exports  — editor+, concurrent export rate-limited per §3.10
pub async fn create_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

    // Resolve workspace plan to enforce concurrent-export limits.
    let row: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT w.id, w.plan::text \
         FROM workspaces w JOIN projects p ON p.workspace_id = w.id \
         WHERE p.id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;

    let (workspace_id, plan) = row.unwrap_or_else(|| (Uuid::nil(), "free".into()));

    state.rate_limiter.check_concurrent_exports(workspace_id, &plan).await?;

    // TODO: create ExportJob row, enqueue RenderExport job.
    // On completion/failure the worker must call rate_limiter.release_export_slot(workspace_id).

    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// GET /projects/:id/exports  — viewer+  (stub)
pub async fn list_exports(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Viewer).await?;
    Ok(Json(json!({ "exports": [] })))
}

// ─── Router ────────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        // Project CRUD
        .route("/projects",       post(create_project).get(list_projects))
        .route("/projects/:id",   get(get_project).patch(update_project).delete(delete_project))
        .route("/projects/:id/duplicate", post(duplicate_project))
        // Tracks
        .route("/projects/:id/tracks",             post(create_track))
        .route("/projects/:id/tracks/:trackId",    patch(update_track).delete(delete_track))
        // Clips — batch must come BEFORE :clipId to avoid shadowing
        .route("/projects/:id/clips/batch",        post(batch_clips))
        .route("/projects/:id/clips",              post(create_clip))
        .route("/projects/:id/clips/:clipId",      patch(update_clip).delete(delete_clip))
        .route("/projects/:id/clips/:clipId/split", post(split_clip))
        // Effects — reorder must come BEFORE :effectId
        .route("/projects/:id/clips/:clipId/effects/reorder",     patch(reorder_effects))
        .route("/projects/:id/clips/:clipId/effects",             post(create_effect))
        .route("/projects/:id/clips/:clipId/effects/:effectId",   patch(update_effect).delete(delete_effect))
        // Transitions
        .route("/projects/:id/transitions",                   post(create_transition))
        .route("/projects/:id/transitions/:transitionId",     patch(update_transition).delete(delete_transition))
        // Text overlays
        .route("/projects/:id/text-overlays",             post(create_text_overlay))
        .route("/projects/:id/text-overlays/:overlayId",  patch(update_text_overlay).delete(delete_text_overlay))
        // Exports under project
        .route("/projects/:id/exports", post(create_export).get(list_exports))
}
