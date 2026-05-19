//! Export pipeline: load project timeline → download clip proxies → ffmpeg composite → upload.

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::WorkerError,
    ffmpeg,
    processor::{get_field, JobFields},
    storage,
};

#[derive(Debug, sqlx::FromRow)]
struct ClipRow {
    pos_ms: i64,
    dur_ms: i64,
    trim_in_ms: i64,
    speed: f64,
    original_key: Option<String>,
    proxy_key: Option<String>,
}

pub async fn run(
    fields: &JobFields,
    db: &PgPool,
    config: &Config,
    s3_client: &aws_sdk_s3::Client,
) -> Result<(), WorkerError> {
    let job_id: Uuid = get_field(fields, "job_id")?
        .parse()
        .map_err(|_| WorkerError::MissingField("job_id".into()))?;
    let project_id: Uuid = get_field(fields, "project_id")?
        .parse()
        .map_err(|_| WorkerError::MissingField("project_id".into()))?;
    let format = get_field(fields, "format")?.to_owned();
    let resolution = get_field(fields, "resolution")?.to_owned();

    tracing::info!(%job_id, %project_id, format=%format, resolution=%resolution, "starting export");

    // ── Mark job as processing ──────────────────────────────────────────────
    sqlx::query(
        "UPDATE export_jobs SET status='processing'::job_status, started_at=now() WHERE id=$1",
    )
    .bind(job_id)
    .execute(db)
    .await?;

    // ── Load project settings ───────────────────────────────────────────────
    let project: Option<(i16, i32, i32)> =
        sqlx::query_as("SELECT fps, resolution_w, resolution_h FROM projects WHERE id=$1")
            .bind(project_id)
            .fetch_optional(db)
            .await?;
    let (fps, _proj_w, _proj_h) =
        project.ok_or_else(|| WorkerError::Other(format!("project {project_id} not found")))?;

    let (width, height) = match resolution.as_str() {
        "360" => (640u32, 360u32),
        "720" => (1280u32, 720u32),
        "2160" => (3840u32, 2160u32),
        _ => (1920u32, 1080u32),
    };

    // ── Load clips ordered by track position + pos_ms ───────────────────────
    let clips: Vec<ClipRow> = sqlx::query_as::<_, ClipRow>(
        r#"
        SELECT c.pos_ms, c.dur_ms, c.trim_in_ms, c.speed::float8 AS speed,
               a.original_key AS original_key,
               av.s3_key      AS proxy_key
        FROM clips c
        JOIN tracks t ON t.id = c.track_id
        LEFT JOIN assets a ON a.id = c.asset_id
        LEFT JOIN asset_variants av ON av.asset_id = a.id AND av.variant = 'proxy'
        WHERE t.project_id = $1
          AND t.kind = 'video'
          AND t.muted = false
        ORDER BY t.position, c.pos_ms
        "#,
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    if clips.is_empty() {
        fail_job(db, job_id, "no video clips in project").await?;
        return Ok(());
    }

    // ── Download source files to temp dir ───────────────────────────────────
    let tmp = tempfile::TempDir::new()?;
    let mut paths_and_meta: Vec<(std::path::PathBuf, i64, i64, i64, f64)> = Vec::new();

    for (i, clip) in clips.iter().enumerate() {
        let s3_key = clip
            .original_key
            .as_deref()
            .or(clip.proxy_key.as_deref());
        let Some(key) = s3_key else {
            tracing::warn!(i, "clip has no source asset, skipping");
            continue;
        };
        let ext = key.rsplit('.').next().unwrap_or("mp4");
        let local = tmp.path().join(format!("clip_{i}.{ext}"));
        storage::download_file(s3_client, &config.s3_bucket, key, &local).await?;
        paths_and_meta.push((local, clip.pos_ms, clip.dur_ms, clip.trim_in_ms, clip.speed));
    }

    if paths_and_meta.is_empty() {
        fail_job(db, job_id, "no clips have a source asset to render").await?;
        return Ok(());
    }

    let clip_refs: Vec<ffmpeg::ClipSpec<'_>> = paths_and_meta
        .iter()
        .map(|(path, pos, dur, trim, speed)| ffmpeg::ClipSpec {
            local_path: path.as_path(),
            pos_ms: *pos,
            dur_ms: *dur,
            trim_in_ms: *trim,
            speed: *speed,
            filters: "",
        })
        .collect();

    // ── Run ffmpeg composite ────────────────────────────────────────────────
    let ext = match format.as_str() {
        "webm" => "webm",
        "mov" => "mov",
        _ => "mp4",
    };
    let output_path = tmp.path().join(format!("output.{ext}"));

    let spec = ffmpeg::ExportSpec {
        clips: &clip_refs,
        fps: fps as u32,
        width,
        height,
        format: &format,
        output: &output_path,
    };

    if let Err(e) = ffmpeg::export_timeline(&spec).await {
        fail_job(db, job_id, &e.to_string()).await?;
        return Err(e);
    }

    // ── Upload output ───────────────────────────────────────────────────────
    let content_type = match format.as_str() {
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => "video/mp4",
    };
    let output_key = format!("exports/{project_id}/{job_id}/output.{ext}");
    storage::upload_file(s3_client, &config.s3_bucket, &output_key, &output_path, content_type).await?;

    // ── Mark job done ───────────────────────────────────────────────────────
    sqlx::query(
        "UPDATE export_jobs SET status='done'::job_status, output_key=$1, progress_pct=100, finished_at=now() WHERE id=$2",
    )
    .bind(&output_key)
    .bind(job_id)
    .execute(db)
    .await?;

    tracing::info!(%job_id, output_key=%output_key, "export complete");
    Ok(())
}

async fn fail_job(db: &PgPool, job_id: Uuid, msg: &str) -> Result<(), WorkerError> {
    tracing::error!(%job_id, error=%msg, "export job failed");
    sqlx::query(
        "UPDATE export_jobs SET status='error'::job_status, error_msg=$1, finished_at=now() WHERE id=$2",
    )
    .bind(msg)
    .bind(job_id)
    .execute(db)
    .await?;
    Ok(())
}
