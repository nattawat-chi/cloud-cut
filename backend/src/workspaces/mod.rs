pub mod authz;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    rate_limit,
    state::AppState,
    workspaces::authz::{require_workspace_role, Role},
};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow, Serialize, ToSchema)]
pub struct WorkspaceRow {
    pub id: Uuid,
    pub name: String,
    pub plan: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Serialize, ToSchema)]
pub struct WorkspaceDetail {
    pub id: Uuid,
    pub name: String,
    pub plan: String,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateWorkspaceReq {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct InviteMemberReq {
    #[validate(email)]
    pub email: String,
    /// "editor" | "viewer" | "admin"
    pub role: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateMemberReq {
    /// New role: "admin" | "editor" | "viewer"  (cannot promote to "owner")
    pub role: String,
}

#[derive(Debug, sqlx::FromRow, Serialize, ToSchema)]
pub struct WorkspaceMemberRow {
    pub user_id: Uuid,
    pub display_name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct WorkspaceUsageResponse {
    pub plan: String,
    pub uploads_used: i64,
    pub uploads_limit: i64,
    /// Seconds until the hourly upload bucket resets. 0 when the bucket
    /// hasn't been touched this hour yet (no Redis TTL set).
    pub uploads_reset_in_secs: i64,
    pub exports_concurrent_used: i64,
    pub exports_concurrent_limit: i64,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /api/v1/workspaces — every workspace the caller belongs to.
#[utoipa::path(
    get,
    path = "/api/v1/workspaces",
    responses(
        (status = 200, description = "Workspaces the caller is a member of", body = Vec<WorkspaceRow>),
        (status = 401, description = "Missing or invalid Bearer token"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn list_workspaces(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<WorkspaceRow>>, AppError> {
    let rows = sqlx::query_as::<_, WorkspaceRow>(
        r#"
        SELECT w.id, w.name, w.plan::text AS plan, wm.role::text AS role, w.created_at
        FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = $1
        ORDER BY w.created_at
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

/// POST /api/v1/workspaces — create a new workspace and add the caller as owner.
#[utoipa::path(
    post,
    path = "/api/v1/workspaces",
    request_body = CreateWorkspaceReq,
    responses(
        (status = 201, description = "Workspace created", body = WorkspaceDetail),
        (status = 400, description = "Validation error"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn create_workspace(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateWorkspaceReq>,
) -> Result<(StatusCode, Json<WorkspaceDetail>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let mut tx = state.db.begin().await?;

    let row = sqlx::query_as::<_, WorkspaceDetail>(
        r#"
        INSERT INTO workspaces (name, owner_id)
        VALUES ($1, $2)
        RETURNING id, name, plan::text AS plan, owner_id, created_at
        "#,
    )
    .bind(&req.name)
    .bind(auth.user_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(row.id)
    .bind(auth.user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(row)))
}

/// GET /api/v1/workspaces/:id — fetch a single workspace the caller belongs to.
#[utoipa::path(
    get,
    path = "/api/v1/workspaces/{id}",
    params(("id" = Uuid, Path, description = "Workspace UUID")),
    responses(
        (status = 200, description = "Workspace detail", body = WorkspaceDetail),
        (status = 403, description = "Not a member of this workspace"),
        (status = 404, description = "Workspace not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn get_workspace(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<WorkspaceDetail>, AppError> {
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Viewer).await?;

    let row = sqlx::query_as::<_, WorkspaceDetail>(
        "SELECT id, name, plan::text AS plan, owner_id, created_at
         FROM workspaces WHERE id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("workspace".into()))?;

    Ok(Json(row))
}

/// GET /api/v1/workspaces/:id/members — list all members (viewer+).
#[utoipa::path(
    get,
    path = "/api/v1/workspaces/{id}/members",
    params(("id" = Uuid, Path, description = "Workspace UUID")),
    responses(
        (status = 200, description = "Member list", body = Vec<WorkspaceMemberRow>),
        (status = 403, description = "Not a member"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn list_members(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<WorkspaceMemberRow>>, AppError> {
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Viewer).await?;

    let rows = sqlx::query_as::<_, WorkspaceMemberRow>(
        r#"
        SELECT u.id AS user_id, u.display_name, u.email, u.avatar_url,
               wm.role::text AS role, wm.joined_at
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
        ORDER BY
            CASE wm.role::text
                WHEN 'owner'  THEN 0
                WHEN 'admin'  THEN 1
                WHEN 'editor' THEN 2
                WHEN 'viewer' THEN 3
                ELSE 4
            END,
            wm.joined_at
        "#,
    )
    .bind(workspace_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

/// POST /api/v1/workspaces/:id/invite — create a pending invitation (admin+).
#[utoipa::path(
    post,
    path = "/api/v1/workspaces/{id}/invite",
    params(("id" = Uuid, Path, description = "Workspace UUID")),
    request_body = InviteMemberReq,
    responses(
        (status = 201, description = "Invitation created"),
        (status = 403, description = "Insufficient role — admin+ required"),
        (status = 400, description = "Invalid role value"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn invite_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(req): Json<InviteMemberReq>,
) -> Result<StatusCode, AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Admin).await?;

    // owner role cannot be assigned via invite
    if req.role == "owner" {
        return Err(AppError::BadRequest("cannot invite with owner role".into()));
    }
    let role_cast = validate_role_str(&req.role)?;

    sqlx::query(
        r#"
        INSERT INTO invitations (workspace_id, email, role, invited_by)
        VALUES ($1, $2, $3::member_role, $4)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(workspace_id)
    .bind(&req.email)
    .bind(role_cast)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::CREATED)
}

/// PATCH /api/v1/workspaces/:id/members/:userId — change a member's role (admin+).
#[utoipa::path(
    patch,
    path = "/api/v1/workspaces/{id}/members/{userId}",
    params(
        ("id" = Uuid, Path, description = "Workspace UUID"),
        ("userId" = Uuid, Path, description = "User UUID"),
    ),
    request_body = UpdateMemberReq,
    responses(
        (status = 204, description = "Role updated"),
        (status = 403, description = "Insufficient role or attempting to change owner"),
        (status = 404, description = "Member not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn update_member_role(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((workspace_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdateMemberReq>,
) -> Result<StatusCode, AppError> {
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Admin).await?;

    // Prevent demoting / changing the owner
    let current_role: Option<String> = sqlx::query_scalar(
        "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await?;

    let current_role = current_role.ok_or_else(|| AppError::NotFound("member".into()))?;
    if current_role == "owner" {
        return Err(AppError::Forbidden);
    }
    if req.role == "owner" {
        return Err(AppError::BadRequest("cannot promote to owner via this endpoint".into()));
    }

    let role_cast = validate_role_str(&req.role)?;

    let updated = sqlx::query(
        "UPDATE workspace_members SET role = $1::member_role
         WHERE workspace_id = $2 AND user_id = $3",
    )
    .bind(role_cast)
    .bind(workspace_id)
    .bind(target_user_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("member".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/workspaces/:id/members/:userId — remove a member (admin+).
#[utoipa::path(
    delete,
    path = "/api/v1/workspaces/{id}/members/{userId}",
    params(
        ("id" = Uuid, Path, description = "Workspace UUID"),
        ("userId" = Uuid, Path, description = "User UUID to remove"),
    ),
    responses(
        (status = 204, description = "Member removed"),
        (status = 403, description = "Insufficient role or attempting to remove owner"),
        (status = 404, description = "Member not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((workspace_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Admin).await?;

    // Guard: cannot remove the workspace owner
    let current_role: Option<String> = sqlx::query_scalar(
        "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await?;

    match current_role.as_deref() {
        None => return Err(AppError::NotFound("member".into())),
        Some("owner") => return Err(AppError::Forbidden),
        _ => {}
    }

    sqlx::query(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(target_user_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/workspaces/:id/usage — current rate-limit counter values.
///
/// Pure read against Redis (no INCR), safe for the frontend to poll.
/// Used by the topbar / Export dialog to show "3/50 uploads · 1/10 exports"
/// instead of just the plan limit.
#[utoipa::path(
    get,
    path = "/api/v1/workspaces/{id}/usage",
    params(("id" = Uuid, Path, description = "Workspace UUID")),
    responses(
        (status = 200, description = "Current upload + export quota usage", body = WorkspaceUsageResponse),
        (status = 403, description = "Not a member of this workspace"),
    ),
    security(("bearer_auth" = [])),
    tag = "workspaces",
)]
pub async fn get_workspace_usage(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<WorkspaceUsageResponse>, AppError> {
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Viewer).await?;
    let snap = rate_limit::snapshot_usage(&state, workspace_id).await?;
    Ok(Json(WorkspaceUsageResponse {
        plan: snap.plan,
        uploads_used: snap.uploads_used,
        uploads_limit: snap.uploads_limit,
        uploads_reset_in_secs: snap.uploads_reset_in_secs,
        exports_concurrent_used: snap.exports_concurrent_used,
        exports_concurrent_limit: snap.exports_concurrent_limit,
    }))
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workspaces", get(list_workspaces).post(create_workspace))
        .route("/workspaces/:id", get(get_workspace))
        .route("/workspaces/:id/usage", get(get_workspace_usage))
        .route("/workspaces/:id/members", get(list_members))
        .route("/workspaces/:id/invite", post(invite_member))
        .route(
            "/workspaces/:id/members/:user_id",
            patch(update_member_role).delete(remove_member),
        )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn validate_role_str(role: &str) -> Result<&str, AppError> {
    match role {
        "admin" | "editor" | "viewer" => Ok(role),
        other => Err(AppError::BadRequest(format!("invalid role: {other}"))),
    }
}
