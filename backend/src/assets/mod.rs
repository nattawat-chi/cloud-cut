use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    models::Role,
    state::AppState,
    workspaces::authz::{require_role, require_workspace_role},
};

#[derive(Deserialize)]
pub struct PresignedUrlBody {
    #[serde(rename = "workspaceId")]
    pub workspace_id: Uuid,
    pub filename:     String,
    pub content_type: String,
}

#[derive(Deserialize)]
pub struct ConfirmUploadBody {
    pub asset_id: Uuid,
}

#[derive(Deserialize)]
pub struct ListAssetsQuery {
    #[serde(rename = "projectId")]
    pub project_id: Option<Uuid>,
    #[serde(rename = "workspaceId")]
    pub workspace_id: Option<Uuid>,
}

/// POST /assets/presigned-url  — editor+ in workspace, upload rate-limited per §3.10
pub async fn presigned_url(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<PresignedUrlBody>,
) -> Result<Json<Value>, AppError> {
    require_workspace_role(&state.db, auth.user_id, body.workspace_id, Role::Editor).await?;

    // Look up workspace plan so the rate limiter can apply the correct limit.
    let plan: String = sqlx::query_scalar(
        "SELECT plan::text FROM workspaces WHERE id = $1",
    )
    .bind(body.workspace_id)
    .fetch_optional(&state.db)
    .await?
    .unwrap_or_else(|| "free".into());

    state.rate_limiter.check_upload(body.workspace_id, &plan).await?;

    // TODO: generate real presigned URL from R2 / S3-compatible storage.
    Ok(Json(json!({
        "uploadUrl": "https://storage.example.com/presigned-stub",
        "assetId":   Uuid::new_v4(),
        "expiresIn": 900,
    })))
}

/// POST /assets/confirm-upload  — editor+ (derive workspace from asset row)  (stub)
pub async fn confirm_upload(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ConfirmUploadBody>,
) -> Result<StatusCode, AppError> {
    // Resolve workspace from the asset so we can authz correctly.
    let ws_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT workspace_id FROM assets WHERE id = $1",
    )
    .bind(body.asset_id)
    .fetch_optional(&state.db)
    .await?;

    let ws_id = ws_id.ok_or_else(|| AppError::NotFound("asset".into()))?;
    require_workspace_role(&state.db, auth.user_id, ws_id, Role::Editor).await?;

    // TODO: mark asset ready, enqueue processing jobs.
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// GET /assets  — viewer+ (project or workspace scope)
pub async fn list_assets(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<ListAssetsQuery>,
) -> Result<Json<Value>, AppError> {
    if let Some(project_id) = q.project_id {
        require_role(&state.db, auth.user_id, project_id, Role::Viewer).await?;
    } else if let Some(workspace_id) = q.workspace_id {
        require_workspace_role(&state.db, auth.user_id, workspace_id, Role::Viewer).await?;
    } else {
        return Err(AppError::Validation("projectId or workspaceId required".into()));
    }

    Ok(Json(json!({ "assets": [] })))
}

/// GET /assets/:id  — viewer+ (resolve workspace via asset)
pub async fn get_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(asset_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT workspace_id, name, status::text FROM assets WHERE id = $1",
    )
    .bind(asset_id)
    .fetch_optional(&state.db)
    .await?;

    let (ws_id, name, status) = row.ok_or_else(|| AppError::NotFound("asset".into()))?;
    require_workspace_role(&state.db, auth.user_id, ws_id, Role::Viewer).await?;

    Ok(Json(json!({ "id": asset_id, "name": name, "status": status })))
}

/// DELETE /assets/:id  — editor+
pub async fn delete_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(asset_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let ws_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT workspace_id FROM assets WHERE id = $1",
    )
    .bind(asset_id)
    .fetch_optional(&state.db)
    .await?;

    let ws_id = ws_id.ok_or_else(|| AppError::NotFound("asset".into()))?;
    require_workspace_role(&state.db, auth.user_id, ws_id, Role::Editor).await?;

    sqlx::query("DELETE FROM assets WHERE id = $1")
        .bind(asset_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/assets/presigned-url",    post(presigned_url))
        .route("/assets/confirm-upload",   post(confirm_upload))
        .route("/assets",                  get(list_assets))
        .route("/assets/:id",              get(get_asset).delete(delete_asset))
}
