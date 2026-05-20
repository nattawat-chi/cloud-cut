use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

// ─── DB row ───────────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow, Serialize, ToSchema)]
pub struct ProjectRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub description: String,
    pub fps: i16,
    pub resolution_w: i32,
    pub resolution_h: i32,
    pub duration_ms: i64,
    pub thumbnail_url: Option<String>,
    pub archived: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProjectReq {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub description: Option<String>,
    pub fps: Option<i16>,
    pub resolution_w: Option<i32>,
    pub resolution_h: Option<i32>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateProjectReq {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub duration_ms: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub fps: Option<i16>,
    pub resolution_w: Option<i32>,
    pub resolution_h: Option<i32>,
}

// ─── Pagination ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams)]
pub struct ListQuery {
    /// Opaque cursor from previous page's `next_cursor` field.
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PagedProjects {
    pub items: Vec<ProjectRow>,
    pub next_cursor: Option<String>,
}
