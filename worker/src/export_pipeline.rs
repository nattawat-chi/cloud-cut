//! Export pipeline: load project timeline → download clip proxies → ffmpeg composite → upload.

use redis::AsyncCommands;
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
    redis: &redis::Client,
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

    // Resolve workspace_id up-front so we can release the concurrent-export
    // slot in *every* exit path below (success, ffmpeg error, S3 error,
    // dead-lettered retries). Skipping this would leak the Redis counter and
    // pin the workspace at its concurrency cap until the 24h safety TTL
    // expires — the user reported "stuck" exports for exactly this reason.
    let workspace_id = lookup_workspace(db, project_id).await;
    if workspace_id.is_none() {
        tracing::warn!(%project_id, "workspace lookup failed — slot release will be skipped");
    }

    let result = run_inner(
        job_id,
        project_id,
        &format,
        &resolution,
        db,
        config,
        s3_client,
    )
    .await;

    if let Some(ws) = workspace_id {
        release_export_slot(redis, ws).await;
    }

    result
}

/// Inner pipeline body — extracted so the outer `run` can always release the
/// concurrency slot regardless of which `?` propagates a failure.
async fn run_inner(
    job_id: Uuid,
    project_id: Uuid,
    format: &str,
    resolution: &str,
    db: &PgPool,
    config: &Config,
    s3_client: &aws_sdk_s3::Client,
) -> Result<(), WorkerError> {
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

    let (width, height) = match resolution {
        "360" => (640u32, 360u32),
        "720" => (1280u32, 720u32),
        "2160" => (3840u32, 2160u32),
        _ => (1920u32, 1080u32),
    };

    // ── Load clips from the MAIN video track only, ordered by pos_ms ──────
    // "Main" = lowest-position non-muted video track (V1). Per the export
    // spec we render a single track; overlays from V2+ are a future feature.
    let clips: Vec<ClipRow> = sqlx::query_as::<_, ClipRow>(
        r#"
        SELECT c.pos_ms, c.dur_ms, c.trim_in_ms, c.speed::float8 AS speed,
               a.original_key AS original_key,
               av.s3_key      AS proxy_key
        FROM clips c
        JOIN tracks t ON t.id = c.track_id
        LEFT JOIN assets a ON a.id = c.asset_id
        LEFT JOIN asset_variants av ON av.asset_id = a.id AND av.variant = 'proxy'
        WHERE t.id = (
            SELECT id FROM tracks
            WHERE project_id = $1 AND kind = 'video' AND muted = false
            ORDER BY position ASC, id ASC
            LIMIT 1
        )
        ORDER BY c.pos_ms ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    if clips.is_empty() {
        fail_job(db, job_id, "no clips on the main video track").await?;
        return Ok(());
    }

    // ── Audio-track clips (A1, A2…) — mixed in via adelay+amix below ───────
    // We don't fail when this is empty: a video-only export is still valid.
    let audio_clips: Vec<ClipRow> = sqlx::query_as::<_, ClipRow>(
        r#"
        SELECT c.pos_ms, c.dur_ms, c.trim_in_ms, c.speed::float8 AS speed,
               a.original_key AS original_key,
               av.s3_key      AS proxy_key
        FROM clips c
        JOIN tracks t ON t.id = c.track_id
        LEFT JOIN assets a ON a.id = c.asset_id
        LEFT JOIN asset_variants av ON av.asset_id = a.id AND av.variant = 'proxy'
        WHERE t.project_id = $1
          AND t.kind = 'audio'
          AND t.muted = false
        ORDER BY c.pos_ms ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    // Total output duration — used for progress % during ffmpeg encode.
    let total_duration_ms: i64 = clips
        .iter()
        .map(|c| (c.dur_ms as f64 / c.speed.max(0.01)) as i64)
        .sum();

    // ── Download source files to temp dir (progress 0% → 10%) ──────────────
    let tmp = tempfile::TempDir::new()?;
    // (path, pos_ms, dur_ms, trim_in_ms, speed, has_audio)
    let mut paths_and_meta: Vec<(std::path::PathBuf, i64, i64, i64, f64, bool)> = Vec::new();
    let n_clips = clips.len().max(1);

    for (i, clip) in clips.iter().enumerate() {
        let s3_key = clip.original_key.as_deref().or(clip.proxy_key.as_deref());
        let Some(key) = s3_key else {
            tracing::warn!(i, "clip has no source asset, skipping");
            continue;
        };
        let ext = key.rsplit('.').next().unwrap_or("mp4");
        let local = tmp.path().join(format!("clip_{i}.{ext}"));
        storage::download_file(s3_client, &config.s3_bucket, key, &local).await?;

        // Probe to find out whether this source has an audio stream — the
        // filter graph uses anullsrc when it doesn't, otherwise `[i:a]` would
        // fail with "matches no streams". Probe failure is non-fatal: assume
        // no audio so we fall back to the silent path.
        let has_audio = match ffmpeg::probe(&local).await {
            Ok(p) => p.has_audio,
            Err(e) => {
                tracing::warn!(i, error=%e, "probe failed, assuming no audio");
                false
            }
        };

        paths_and_meta.push((
            local,
            clip.pos_ms,
            clip.dur_ms,
            clip.trim_in_ms,
            clip.speed,
            has_audio,
        ));

        // Linear 0 → 10% across the download phase
        let pct = ((i + 1) as f64 / n_clips as f64 * 10.0) as i16;
        update_progress(db, job_id, pct).await;
    }

    if paths_and_meta.is_empty() {
        fail_job(db, job_id, "no clips have a source asset to render").await?;
        return Ok(());
    }

    // ── Download audio-track sources to temp dir ──────────────────────────
    // (path, pos_ms, dur_ms, trim_in_ms, speed)
    let mut audio_paths_and_meta: Vec<(std::path::PathBuf, i64, i64, i64, f64)> = Vec::new();
    for (j, clip) in audio_clips.iter().enumerate() {
        // Audio assets don't always have a worker-generated proxy — fall back
        // to the original_key (mp3/wav/etc.), which the browser-friendly
        // formats all play in ffmpeg too.
        let s3_key = clip.proxy_key.as_deref().or(clip.original_key.as_deref());
        let Some(key) = s3_key else {
            tracing::warn!(j, "audio clip has no source asset, skipping");
            continue;
        };
        let ext = key.rsplit('.').next().unwrap_or("mp3");
        let local = tmp.path().join(format!("audio_{j}.{ext}"));
        storage::download_file(s3_client, &config.s3_bucket, key, &local).await?;
        audio_paths_and_meta.push((local, clip.pos_ms, clip.dur_ms, clip.trim_in_ms, clip.speed));
    }

    let clip_refs: Vec<ffmpeg::ClipSpec<'_>> = paths_and_meta
        .iter()
        .map(
            |(path, pos, dur, trim, speed, has_audio)| ffmpeg::ClipSpec {
                local_path: path.as_path(),
                pos_ms: *pos,
                dur_ms: *dur,
                trim_in_ms: *trim,
                speed: *speed,
                filters: "",
                has_audio: *has_audio,
            },
        )
        .collect();

    let audio_clip_refs: Vec<ffmpeg::AudioClipSpec<'_>> = audio_paths_and_meta
        .iter()
        .map(|(path, pos, dur, trim, speed)| ffmpeg::AudioClipSpec {
            local_path: path.as_path(),
            pos_ms: *pos,
            dur_ms: *dur,
            trim_in_ms: *trim,
            speed: *speed,
        })
        .collect();

    // ── Run ffmpeg composite ────────────────────────────────────────────────
    let ext = match format {
        "webm" => "webm",
        "mov" => "mov",
        _ => "mp4",
    };
    let output_path = tmp.path().join(format!("output.{ext}"));

    let spec = ffmpeg::ExportSpec {
        clips: &clip_refs,
        audio_clips: &audio_clip_refs,
        fps: fps as u32,
        width,
        height,
        format,
        output: &output_path,
    };

    // ── ffmpeg encode (progress 10% → 95%) ──────────────────────────────────
    let db_clone = db.clone();
    let encode_result =
        ffmpeg::export_timeline(&spec, Some(total_duration_ms), move |ffmpeg_pct| {
            // Map ffmpeg's 0..100 into our 10..95 export-pipeline band.
            let pct = 10 + (ffmpeg_pct as f64 * 0.85) as i16;
            let db = db_clone.clone();
            async move {
                let _ = sqlx::query("UPDATE export_jobs SET progress_pct = $1 WHERE id = $2")
                    .bind(pct.min(95))
                    .bind(job_id)
                    .execute(&db)
                    .await;
            }
        })
        .await;

    if let Err(e) = encode_result {
        fail_job(db, job_id, &e.to_string()).await?;
        return Err(e);
    }

    // ── Upload output (progress 95% → 99% via background ticker, 100% on done) ─
    update_progress(db, job_id, 95).await;

    // The S3 SDK's put_object doesn't expose chunk-level callbacks, so a large
    // upload would otherwise pin the UI at 95% with no feedback. Tick +1% every
    // 2s up to 99 while the upload future is in flight, then abort the task
    // once upload completes and let the final UPDATE jump straight to 100.
    let upload_ticker = {
        let db = db.clone();
        tokio::spawn(async move {
            let mut pct: i16 = 95;
            while pct < 99 {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                pct += 1;
                let _ = sqlx::query("UPDATE export_jobs SET progress_pct = $1 WHERE id = $2")
                    .bind(pct)
                    .bind(job_id)
                    .execute(&db)
                    .await;
            }
        })
    };

    let content_type = match format {
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => "video/mp4",
    };
    let output_key = format!("exports/{project_id}/{job_id}/output.{ext}");
    let upload_result = storage::upload_file(
        s3_client,
        &config.s3_bucket,
        &output_key,
        &output_path,
        content_type,
    )
    .await;

    upload_ticker.abort();
    upload_result?;

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

/// Best-effort progress update — swallow errors so a flaky DB connection
/// doesn't abort the export. The final UPDATE at job-done time is the
/// authoritative one.
async fn update_progress(db: &PgPool, job_id: Uuid, pct: i16) {
    let _ = sqlx::query("UPDATE export_jobs SET progress_pct = $1 WHERE id = $2")
        .bind(pct.clamp(0, 100))
        .bind(job_id)
        .execute(db)
        .await;
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

/// Resolve the workspace owning this project — used to find the rate-limit
/// key (`cloudcut:exports:concurrent:{workspace_id}`) shared with the
/// backend. Returns None on lookup failure; the caller treats that as
/// "skip slot release" (the 24h Redis TTL eventually cleans up the leak).
async fn lookup_workspace(db: &PgPool, project_id: Uuid) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
}

/// Free up the concurrent-export slot the backend reserved when this job
/// was enqueued. Mirrors `backend::rate_limit::release_export_slot` — both
/// must DECR the *exact same* key, or the counter drifts and exports get
/// rejected forever.
///
/// Best-effort: a missed DECR caps the workspace's concurrency by one until
/// the 24h TTL fires. We swallow errors so a Redis hiccup never aborts the
/// job's cleanup path.
async fn release_export_slot(redis: &redis::Client, workspace_id: Uuid) {
    let key = format!("cloudcut:exports:concurrent:{workspace_id}");
    let mut conn = match redis.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(%workspace_id, error=%e, "release_export_slot: redis connect failed");
            return;
        }
    };
    match conn.decr::<_, _, i64>(&key, 1i64).await {
        Ok(n) if n < 0 => {
            // Underflow guard: a stale DECR (e.g. retry path that already
            // ran) would push the counter negative and let the workspace
            // exceed its limit on subsequent exports. Reset to 0.
            tracing::warn!(%workspace_id, "release_export_slot: counter went negative, resetting");
            let _: Result<(), _> = conn.set(&key, 0i64).await;
        }
        Ok(_) => {
            tracing::debug!(%workspace_id, "released concurrent-export slot");
        }
        Err(e) => {
            tracing::warn!(%workspace_id, error=%e, "release_export_slot: decr failed");
        }
    }
}
