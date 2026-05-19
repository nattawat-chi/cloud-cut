pub mod authz;

use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::{auth::extractor::AuthUser, error::AppError, state::AppState};

#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct WorkspaceRow {
    pub id: Uuid,
    pub name: String,
    pub plan: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

/// GET /api/v1/workspaces — every workspace the caller belongs to.
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

pub fn router() -> Router<AppState> {
    Router::new().route("/workspaces", get(list_workspaces))
}
