use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use redis::AsyncCommands;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    exports::models::{CreateExportReq, ExportJobCreated, ExportJobRow},
    state::AppState,
};

const EXPORT_STREAM: &str = "cloudcut:exports";

// ─── POST /api/v1/projects/:id/exports ────────────────────────────────────────

pub async fn create_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(req): Json<CreateExportReq>,
) -> Result<(StatusCode, Json<ExportJobCreated>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let format = req.format.as_deref().unwrap_or("mp4");
    let resolution = req.resolution.as_deref().unwrap_or("1080");

    let valid_formats = ["mp4", "webm", "mov"];
    let valid_resolutions = ["360", "720", "1080", "2160"];
    if !valid_formats.contains(&format) {
        return Err(AppError::BadRequest(format!(
            "format must be one of: {}",
            valid_formats.join(", ")
        )));
    }
    if !valid_resolutions.contains(&resolution) {
        return Err(AppError::BadRequest(format!(
            "resolution must be one of: {}",
            valid_resolutions.join(", ")
        )));
    }

    // Verify caller has project access
    require_project_access(&state, project_id, auth.user_id).await?;

    let job = sqlx::query_as::<_, ExportJobRow>(
        r#"
        INSERT INTO export_jobs (project_id, requested_by, format, resolution)
        VALUES ($1, $2, $3::export_format, $4::export_resolution)
        RETURNING id, project_id, requested_by, status::text AS status, format::text AS format, resolution::text AS resolution, output_key,
                  progress_pct, error_msg, started_at, finished_at, created_at
        "#,
    )
    .bind(project_id)
    .bind(auth.user_id)
    .bind(format)
    .bind(resolution)
    .fetch_one(&state.db)
    .await?;

    // Enqueue on Redis Stream so the worker picks it up
    let stream_id = enqueue_export(&state, &job).await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(ExportJobCreated { job, stream_id }),
    ))
}

// ─── GET /api/v1/exports/:id ──────────────────────────────────────────────────

pub async fn get_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(job_id): Path<Uuid>,
) -> Result<Json<ExportJobRow>, AppError> {
    let job = sqlx::query_as::<_, ExportJobRow>(
        r#"SELECT id, project_id, requested_by, status::text AS status, format::text AS format, resolution::text AS resolution, output_key,
                  progress_pct, error_msg, started_at, finished_at, created_at
           FROM export_jobs WHERE id = $1"#,
    )
    .bind(job_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("export job".into()))?;

    require_project_access(&state, job.project_id, auth.user_id).await?;
    Ok(Json(job))
}

// ─── GET /api/v1/projects/:id/exports ─────────────────────────────────────────

pub async fn list_exports(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<ExportJobRow>>, AppError> {
    require_project_access(&state, project_id, auth.user_id).await?;

    let jobs = sqlx::query_as::<_, ExportJobRow>(
        r#"SELECT id, project_id, requested_by, status::text AS status, format::text AS format, resolution::text AS resolution, output_key,
                  progress_pct, error_msg, started_at, finished_at, created_at
           FROM export_jobs
           WHERE project_id = $1
           ORDER BY created_at DESC
           LIMIT 50"#,
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(jobs))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn require_project_access(
    state: &AppState,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let workspace_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT workspace_id FROM projects WHERE id = $1 AND archived = false",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;
    let ws_id = workspace_id.ok_or_else(|| AppError::NotFound("project".into()))?;

    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2)",
    )
    .bind(ws_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    if is_member { Ok(()) } else { Err(AppError::Forbidden) }
}

/// Push a message to the Redis Stream `cloudcut:exports`.
/// The worker reads from this stream via `XREADGROUP`.
async fn enqueue_export(
    state: &AppState,
    job: &ExportJobRow,
) -> Result<String, AppError> {
    let mut conn = state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| AppError::internal(format!("redis connect: {e}")))?;

    let stream_id: String = conn
        .xadd(
            EXPORT_STREAM,
            "*",
            &[
                ("job_id", job.id.to_string()),
                ("project_id", job.project_id.to_string()),
                ("format", job.format.clone()),
                ("resolution", job.resolution.clone()),
            ],
        )
        .await
        .map_err(|e| AppError::internal(format!("redis xadd: {e}")))?;

    tracing::info!(job_id = %job.id, stream_id = %stream_id, "export job enqueued");
    Ok(stream_id)
}
