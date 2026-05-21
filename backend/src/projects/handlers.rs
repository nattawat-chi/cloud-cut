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
    timeline::models::{ClipRow, TrackRow},
    workspaces::authz::{require_workspace_role, Role},
};

// ─── GET /api/v1/workspaces/:workspace_id/projects ───────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/workspaces/{workspace_id}/projects",
    params(
        ("workspace_id" = Uuid, Path, description = "Workspace UUID"),
        ListQuery,
    ),
    responses(
        (status = 200, description = "Paginated projects", body = PagedProjects),
        (status = 403, description = "Not a workspace member"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects",
)]
pub async fn list_projects(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Query(q): Query<ListQuery>,
) -> Result<Json<PagedProjects>, AppError> {
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Viewer).await?;

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

#[utoipa::path(
    post,
    path = "/api/v1/workspaces/{workspace_id}/projects",
    params(("workspace_id" = Uuid, Path, description = "Workspace UUID")),
    request_body = CreateProjectReq,
    responses(
        (status = 201, description = "Project created", body = ProjectRow),
        (status = 403, description = "Insufficient role — editor+ required"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects",
)]
pub async fn create_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(req): Json<CreateProjectReq>,
) -> Result<(StatusCode, Json<ProjectRow>), AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    require_workspace_role(&state, workspace_id, auth.user_id, Role::Editor).await?;

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

#[utoipa::path(
    get,
    path = "/api/v1/projects/{id}",
    params(("id" = Uuid, Path, description = "Project UUID")),
    responses(
        (status = 200, description = "Project detail", body = ProjectRow),
        (status = 404, description = "Project not found or archived"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects",
)]
pub async fn get_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ProjectRow>, AppError> {
    let row = fetch_project(&state, project_id).await?;
    require_workspace_role(&state, row.workspace_id, auth.user_id, Role::Viewer).await?;
    Ok(Json(row))
}

// ─── PATCH /api/v1/projects/:id ───────────────────────────────────────────────

#[utoipa::path(
    patch,
    path = "/api/v1/projects/{id}",
    params(("id" = Uuid, Path, description = "Project UUID")),
    request_body = UpdateProjectReq,
    responses(
        (status = 200, description = "Updated project", body = ProjectRow),
        (status = 403, description = "Insufficient role — editor+ required"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects",
)]
pub async fn update_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(req): Json<UpdateProjectReq>,
) -> Result<Json<ProjectRow>, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let existing = fetch_project(&state, project_id).await?;
    require_workspace_role(&state, existing.workspace_id, auth.user_id, Role::Editor).await?;

    let row = sqlx::query_as::<_, ProjectRow>(
        r#"
        UPDATE projects
        SET name          = COALESCE($1, name),
            description   = COALESCE($2, description),
            duration_ms   = COALESCE($3, duration_ms),
            thumbnail_url = COALESCE($4, thumbnail_url),
            fps           = COALESCE($5, fps),
            resolution_w  = COALESCE($6, resolution_w),
            resolution_h  = COALESCE($7, resolution_h)
        WHERE id = $8
        RETURNING id, workspace_id, name, description, fps, resolution_w, resolution_h,
                  duration_ms, thumbnail_url, archived, created_by, created_at, updated_at
        "#,
    )
    .bind(req.name.as_deref())
    .bind(req.description.as_deref())
    .bind(req.duration_ms)
    .bind(req.thumbnail_url.as_deref())
    .bind(req.fps)
    .bind(req.resolution_w)
    .bind(req.resolution_h)
    .bind(project_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

// ─── DELETE /api/v1/projects/:id (archive) ────────────────────────────────────

#[utoipa::path(
    delete,
    path = "/api/v1/projects/{id}",
    params(("id" = Uuid, Path, description = "Project UUID")),
    responses(
        (status = 204, description = "Project archived"),
        (status = 403, description = "Insufficient role — admin+ required"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects",
)]
pub async fn archive_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let existing = fetch_project(&state, project_id).await?;
    require_workspace_role(&state, existing.workspace_id, auth.user_id, Role::Admin).await?;

    sqlx::query("UPDATE projects SET archived = true WHERE id = $1")
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── POST /api/v1/projects/:id/duplicate ─────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/projects/{id}/duplicate",
    params(("id" = Uuid, Path, description = "Project UUID to copy")),
    responses(
        (status = 201, description = "Duplicated project", body = ProjectRow),
        (status = 403, description = "Insufficient role — editor+ required"),
        (status = 404, description = "Project not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "projects",
)]
pub async fn duplicate_project(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<(StatusCode, Json<ProjectRow>), AppError> {
    let src = fetch_project(&state, project_id).await?;
    require_workspace_role(&state, src.workspace_id, auth.user_id, Role::Editor).await?;

    let mut tx = state.db.begin().await?;

    // ── 1. Copy project row ──────────────────────────────────────────────────
    let new_project = sqlx::query_as::<_, ProjectRow>(
        r#"
        INSERT INTO projects
            (workspace_id, name, description, fps, resolution_w, resolution_h,
             duration_ms, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, workspace_id, name, description, fps, resolution_w, resolution_h,
                  duration_ms, thumbnail_url, archived, created_by, created_at, updated_at
        "#,
    )
    .bind(src.workspace_id)
    .bind(format!("Copy of {}", src.name))
    .bind(&src.description)
    .bind(src.fps)
    .bind(src.resolution_w)
    .bind(src.resolution_h)
    .bind(src.duration_ms)
    .bind(auth.user_id)
    .fetch_one(&mut *tx)
    .await?;

    // ── 2. Copy tracks, keeping a map old_id → new_id ────────────────────────
    // Use the runtime-checked `query_as::<_, TrackRow>` instead of `query!()`
    // — the macro version connects to the DB at *compile time* to verify
    // SQL, which breaks fresh clones whose DB has no schema yet (the
    // auto-migration in main.rs runs at *runtime*, after compile).
    let src_tracks = sqlx::query_as::<_, TrackRow>(
        "SELECT id, project_id, kind::text AS kind, name, position, muted, locked, created_at
         FROM tracks WHERE project_id = $1 ORDER BY position",
    )
    .bind(project_id)
    .fetch_all(&mut *tx)
    .await?;

    for track in &src_tracks {
        let new_track_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO tracks (project_id, kind, name, position, muted, locked)
            VALUES ($1, $2::track_kind, $3, $4, $5, $6)
            RETURNING id
            "#,
        )
        .bind(new_project.id)
        .bind(&track.kind)
        .bind(&track.name)
        .bind(track.position)
        .bind(track.muted)
        .bind(track.locked)
        .fetch_one(&mut *tx)
        .await?;

        // ── 3. Copy clips for this track ────────────────────────────────────
        let src_clips = sqlx::query_as::<_, ClipRow>(
            "SELECT id, track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms,
                    speed::float8 AS speed, name, version, created_at, updated_at
             FROM clips WHERE track_id = $1",
        )
        .bind(track.id)
        .fetch_all(&mut *tx)
        .await?;

        for clip in &src_clips {
            let new_clip_id = sqlx::query_scalar::<_, Uuid>(
                r#"
                INSERT INTO clips
                    (track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms, speed, name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
                "#,
            )
            .bind(new_track_id)
            .bind(clip.asset_id)
            .bind(clip.pos_ms)
            .bind(clip.dur_ms)
            .bind(clip.trim_in_ms)
            .bind(clip.trim_out_ms)
            .bind(clip.speed)
            .bind(&clip.name)
            .fetch_one(&mut *tx)
            .await?;

            // ── 4. Copy effects for this clip ────────────────────────────────
            sqlx::query(
                r#"
                INSERT INTO clip_effects (clip_id, type, value, enabled, position)
                SELECT $1, type, value, enabled, position
                FROM clip_effects WHERE clip_id = $2
                "#,
            )
            .bind(new_clip_id)
            .bind(clip.id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(new_project)))
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
            let ts_str = parts
                .next()
                .ok_or_else(|| AppError::BadRequest("invalid cursor".into()))?;
            let id_str = parts
                .next()
                .ok_or_else(|| AppError::BadRequest("invalid cursor".into()))?;
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
        items.last().map(|r| encode_cursor(&r.updated_at, &r.id))
    } else {
        None
    };
    Ok(Json(PagedProjects { items, next_cursor }))
}
