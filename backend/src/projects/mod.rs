//! Project CRUD + nested `/projects/:id/exports` listing.
//!
//! Timeline mutations (tracks, clips, effects, transitions, text overlays)
//! live in [`crate::timeline`] per spec §2.1.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
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

// ─── DTOs ──────────────────────────────────────────────────────────────────────

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

// ─── Handlers ──────────────────────────────────────────────────────────────────

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

// ─── Export sub-routes  (under /projects/:id/exports) ─────────────────────────
// Note: the standalone /exports/:id routes live in crate::exports.

/// POST /projects/:id/exports  — editor+, concurrent export rate-limited per §3.10
pub async fn create_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    _body: Json<Value>,
) -> Result<StatusCode, AppError> {
    require_role(&state.db, auth.user_id, project_id, Role::Editor).await?;

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
        .route("/projects",                post(create_project).get(list_projects))
        .route("/projects/:id",            get(get_project).patch(update_project).delete(delete_project))
        .route("/projects/:id/duplicate",  post(duplicate_project))
        .route("/projects/:id/exports",    post(create_export).get(list_exports))
}
