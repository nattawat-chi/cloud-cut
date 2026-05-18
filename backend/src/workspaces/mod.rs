pub mod authz;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{auth::extractor::AuthUser, error::AppError, models::Role, state::AppState};
use authz::require_workspace_role;

// ─── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
pub struct CreateWorkspaceBody {
    pub name: String,
}

#[derive(Serialize, ToSchema)]
pub struct WorkspacePayload {
    pub id:   Uuid,
    pub name: String,
    /// "free" | "pro" | "team"
    pub plan: String,
}

#[derive(Deserialize)]
pub struct InviteBody {
    pub email: String,
    pub role:  String,
}

#[derive(Deserialize)]
pub struct UpdateMemberBody {
    pub role: String,
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/workspaces",
    request_body = CreateWorkspaceBody,
    responses(
        (status = 201, description = "Workspace created", body = WorkspacePayload),
        (status = 422, description = "Validation error"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces"
)]
pub async fn create_workspace(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateWorkspaceBody>,
) -> Result<(StatusCode, Json<WorkspacePayload>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }

    let ws_id: Uuid = sqlx::query_scalar(
        "INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(&body.name)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(ws_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(WorkspacePayload { id: ws_id, name: body.name, plan: "free".into() }),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/workspaces",
    responses(
        (status = 200, description = "Workspaces the caller is a member of", body = Vec<WorkspacePayload>),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces"
)]
pub async fn list_workspaces(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<WorkspacePayload>>, AppError> {
    let rows: Vec<(Uuid, String, String)> = sqlx::query_as(
        r#"
        SELECT w.id, w.name, w.plan::text
        FROM   workspaces w
        JOIN   workspace_members wm ON wm.workspace_id = w.id
        WHERE  wm.user_id = $1
        ORDER  BY w.created_at DESC
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, name, plan)| WorkspacePayload { id, name, plan })
            .collect(),
    ))
}

/// POST /workspaces/:id/invite  — admin+
pub async fn invite_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<InviteBody>,
) -> Result<StatusCode, AppError> {
    require_workspace_role(&state.db, auth.user_id, workspace_id, Role::Admin).await?;

    if !matches!(body.role.as_str(), "admin" | "editor" | "viewer") {
        return Err(AppError::Validation("invalid role".into()));
    }

    // Insert invitation row (token + expiry set by DB defaults).
    sqlx::query(
        "INSERT INTO invitations (workspace_id, email, invited_by, role) \
         VALUES ($1, $2, $3, $4::member_role)",
    )
    .bind(workspace_id)
    .bind(&body.email)
    .bind(auth.user_id)
    .bind(&body.role)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::ACCEPTED)
}

/// PATCH /workspaces/:id/members/:userId  — admin+
pub async fn update_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((workspace_id, member_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateMemberBody>,
) -> Result<StatusCode, AppError> {
    require_workspace_role(&state.db, auth.user_id, workspace_id, Role::Admin).await?;

    if !matches!(body.role.as_str(), "admin" | "editor" | "viewer") {
        return Err(AppError::Validation("invalid role; allowed: admin | editor | viewer".into()));
    }

    sqlx::query(
        "UPDATE workspace_members SET role = $1::member_role \
         WHERE workspace_id = $2 AND user_id = $3",
    )
    .bind(&body.role)
    .bind(workspace_id)
    .bind(member_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /workspaces/:id/members/:userId  — admin+
pub async fn remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((workspace_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_workspace_role(&state.db, auth.user_id, workspace_id, Role::Admin).await?;

    sqlx::query(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(member_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workspaces", post(create_workspace).get(list_workspaces))
        .route("/workspaces/:id/invite", post(invite_member))
        .route(
            "/workspaces/:id/members/:userId",
            patch(update_member).delete(remove_member),
        )
}
