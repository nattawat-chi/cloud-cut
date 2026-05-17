use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    projects::models::{CreateProjectReq, ListQuery, PagedProjects, ProjectRow, UpdateProjectReq},
    state::AppState,
};

// ─── GET /api/v1/workspaces/:workspace_id/projects ───────────────────────────

pub async fn list_projects(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Query(q): Query<ListQuery>,
) -> Result<Json<PagedProjects>, AppError> {
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let limit = q.limit.unwrap_or(20).clamp(1, 100);
    let (cursor_ts, cursor_id) = decode_cursor(q.cursor.as_deref())?;

    let items = sqlx::query_as::<_, ProjectRow>(
        r#"
        SELECT id, workspace_id, name, description, fps, resolution_w, resolution_h,
               duration_ms, thumbnail_url, archived, created_by, created_at, updated_at
        FROM projects
        WHERE workspace_id = $1
          AND archived = false
          AND (updated_at, id) < ($2, $3)
        ORDER BY updated_at DESC, id DESC
        LIMIT $4
        "#,
    )
    .bind(workspace_id)
    .bind(cursor_ts)
    .bind(cursor_id)
    .bind(limit + 1)
    .fetch_all(&state.db)
    .await?;

    paginate(items, limit)
}

// ─── POST /api/v1/workspaces/:workspace_id/projects ──────────────────────────

pub async fn create_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(req): Json<CreateProjectReq>,
) -> Result<(StatusCode, Json<ProjectRow>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, ProjectRow>(
        r#"
        INSERT INTO projects (workspace_id, name, description, fps, resolution_w, resolution_h, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, workspace_id, name, description, fps, resolution_w, resolution_h,
                  duration_ms, thumbnail_url, archived, created_by, created_at, updated_at
        "#,
    )
    .bind(workspace_id)
    .bind(&req.name)
    .bind(req.description.as_deref().unwrap_or(""))
    .bind(req.fps.unwrap_or(30))
    .bind(req.resolution_w.unwrap_or(1920))
    .bind(req.resolution_h.unwrap_or(1080))
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

// ─── GET /api/v1/projects/:id ─────────────────────────────────────────────────

pub async fn get_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ProjectRow>, AppError> {
    let row = fetch_project(&state, project_id).await?;
    require_workspace_member(&state, row.workspace_id, auth.user_id).await?;
    Ok(Json(row))
}

// ─── PATCH /api/v1/projects/:id ───────────────────────────────────────────────

pub async fn update_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(req): Json<UpdateProjectReq>,
) -> Result<Json<ProjectRow>, AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    let existing = fetch_project(&state, project_id).await?;
    require_workspace_member(&state, existing.workspace_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, ProjectRow>(
        r#"
        UPDATE projects
        SET name          = COALESCE($1, name),
            description   = COALESCE($2, description),
            duration_ms   = COALESCE($3, duration_ms),
            thumbnail_url = COALESCE($4, thumbnail_url)
        WHERE id = $5
        RETURNING id, workspace_id, name, description, fps, resolution_w, resolution_h,
                  duration_ms, thumbnail_url, archived, created_by, created_at, updated_at
        "#,
    )
    .bind(req.name.as_deref())
    .bind(req.description.as_deref())
    .bind(req.duration_ms)
    .bind(req.thumbnail_url.as_deref())
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

// ─── DELETE /api/v1/projects/:id (archive) ────────────────────────────────────

pub async fn archive_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let existing = fetch_project(&state, project_id).await?;
    require_workspace_member(&state, existing.workspace_id, auth.user_id).await?;

    sqlx::query("UPDATE projects SET archived = true WHERE id = $1")
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn fetch_project(state: &AppState, id: Uuid) -> Result<ProjectRow, AppError> {
    sqlx::query_as::<_, ProjectRow>(
        r#"SELECT id, workspace_id, name, description, fps, resolution_w, resolution_h,
                  duration_ms, thumbnail_url, archived, created_by, created_at, updated_at
           FROM projects WHERE id = $1 AND archived = false"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("project".into()))
}

async fn require_workspace_member(
    state: &AppState,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2)",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    if exists { Ok(()) } else { Err(AppError::Forbidden) }
}

/// Cursor encodes `"{updated_at_rfc3339}|{uuid}"` as URL-safe base64.
fn decode_cursor(cursor: Option<&str>) -> Result<(DateTime<Utc>, Uuid), AppError> {
    match cursor {
        None => Ok((
            // Sentinel: far future so first page returns newest items
            DateTime::<Utc>::MAX_UTC,
            Uuid::max(),
        )),
        Some(c) => {
            let bytes = URL_SAFE_NO_PAD
                .decode(c)
                .map_err(|_| AppError::BadRequest("invalid cursor".into()))?;
            let s = String::from_utf8(bytes)
                .map_err(|_| AppError::BadRequest("invalid cursor".into()))?;
            let mut parts = s.splitn(2, '|');
            let ts_str = parts.next().ok_or_else(|| AppError::BadRequest("invalid cursor".into()))?;
            let id_str = parts.next().ok_or_else(|| AppError::BadRequest("invalid cursor".into()))?;
            let ts = ts_str
                .parse::<DateTime<Utc>>()
                .map_err(|_| AppError::BadRequest("invalid cursor timestamp".into()))?;
            let id = id_str
                .parse::<Uuid>()
                .map_err(|_| AppError::BadRequest("invalid cursor id".into()))?;
            Ok((ts, id))
        }
    }
}

fn encode_cursor(ts: &DateTime<Utc>, id: &Uuid) -> String {
    URL_SAFE_NO_PAD.encode(format!("{ts}|{id}"))
}

fn paginate(mut items: Vec<ProjectRow>, limit: i64) -> Result<Json<PagedProjects>, AppError> {
    let has_more = items.len() as i64 > limit;
    if has_more {
        items.truncate(limit as usize);
    }
    let next_cursor = if has_more {
        items
            .last()
            .map(|r| encode_cursor(&r.updated_at, &r.id))
    } else {
        None
    };
    Ok(Json(PagedProjects { items, next_cursor }))
}
