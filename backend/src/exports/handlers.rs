use aws_sdk_s3::presigning::PresigningConfig;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use redis::AsyncCommands;
use std::time::Duration;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    exports::models::{CreateExportReq, ExportJobCreated, ExportJobRow},
    rate_limit,
    state::AppState,
    workspaces::authz::{require_project_role, Role},
};

/// Generate a presigned GET URL for a finished export's `output_key`.
/// Returns `None` when the job hasn't produced an output yet or the presign
/// call fails (logged at warn — we still want to return the job row).
async fn presign_download_url(state: &AppState, output_key: Option<&str>) -> Option<String> {
    let key = output_key?;
    let cfg = PresigningConfig::builder()
        .expires_in(Duration::from_secs(state.config.s3_presign_expires_secs))
        .build()
        .ok()?;
    match state
        .s3
        .get_object()
        .bucket(&state.config.s3_bucket)
        .key(key)
        .presigned(cfg)
        .await
    {
        Ok(p) => Some(p.uri().to_string()),
        Err(e) => {
            tracing::warn!(error=%e, key=%key, "presign download URL failed");
            None
        }
    }
}

const EXPORT_STREAM: &str = "cloudcut:exports";

// ─── POST /api/v1/projects/:id/exports ────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/projects/{id}/exports",
    params(("id" = Uuid, Path, description = "Project UUID")),
    request_body = CreateExportReq,
    responses(
        (status = 202, description = "Export job enqueued", body = ExportJobCreated),
        (status = 403, description = "Insufficient role — editor+ required"),
        (status = 429, description = "Concurrent export limit reached for this workspace plan"),
    ),
    security(("bearer_auth" = [])),
    tag = "exports",
)]
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

    // Verify caller has project access — export requires editor+ per §2.6.
    require_project_role(&state, project_id, auth.user_id, Role::Editor).await?;

    // Concurrent-export rate limit (§3.10).  Slot is taken now and must be
    // released by the worker via rate_limit::release_export_slot when the
    // job reaches a terminal state.
    let workspace_id = rate_limit::workspace_for_project(&state, project_id).await?;
    rate_limit::check_concurrent_exports(&state, workspace_id).await?;

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

#[utoipa::path(
    get,
    path = "/api/v1/exports/{id}",
    params(("id" = Uuid, Path, description = "Export job UUID")),
    responses(
        (status = 200, description = "Export job status", body = ExportJobRow),
        (status = 404, description = "Export job not found"),
    ),
    security(("bearer_auth" = [])),
    tag = "exports",
)]
pub async fn get_export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(job_id): Path<Uuid>,
) -> Result<Json<ExportJobRow>, AppError> {
    let mut job = sqlx::query_as::<_, ExportJobRow>(
        r#"SELECT id, project_id, requested_by, status::text AS status, format::text AS format, resolution::text AS resolution, output_key,
                  progress_pct, error_msg, started_at, finished_at, created_at
           FROM export_jobs WHERE id = $1"#,
    )
    .bind(job_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("export job".into()))?;

    require_project_role(&state, job.project_id, auth.user_id, Role::Viewer).await?;

    if job.status == "done" {
        job.download_url = presign_download_url(&state, job.output_key.as_deref()).await;
    }
    Ok(Json(job))
}

// ─── GET /api/v1/projects/:id/exports ─────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/projects/{id}/exports",
    params(("id" = Uuid, Path, description = "Project UUID")),
    responses(
        (status = 200, description = "Export jobs for this project (last 50)", body = Vec<ExportJobRow>),
    ),
    security(("bearer_auth" = [])),
    tag = "exports",
)]
pub async fn list_exports(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<ExportJobRow>>, AppError> {
    require_project_role(&state, project_id, auth.user_id, Role::Viewer).await?;

    let mut jobs = sqlx::query_as::<_, ExportJobRow>(
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

    for job in &mut jobs {
        if job.status == "done" {
            job.download_url = presign_download_url(&state, job.output_key.as_deref()).await;
        }
    }

    Ok(Json(jobs))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
