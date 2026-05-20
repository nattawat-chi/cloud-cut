//! Asset processing pipeline: download original → probe → proxy → thumbnail → waveform → upload variants.
//!
//! Triggered by the backend when a client marks an asset as "processing"
//! (via the `cloudcut:assets` Redis Stream).

use std::path::PathBuf;

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::WorkerError,
    ffmpeg,
    processor::{get_field, JobFields},
    storage,
};

pub async fn run(
    fields: &JobFields,
    db: &PgPool,
    config: &Config,
    s3_client: &aws_sdk_s3::Client,
) -> Result<(), WorkerError> {
    let asset_id: Uuid = get_field(fields, "asset_id")?
        .parse()
        .map_err(|_| WorkerError::MissingField("asset_id (invalid uuid)".into()))?;

    // ── 1. Fetch asset row ──────────────────────────────────────────────────
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT original_key, kind::text AS kind FROM assets WHERE id = $1")
            .bind(asset_id)
            .fetch_optional(db)
            .await?;
    let (original_key, kind) =
        row.ok_or_else(|| WorkerError::Other(format!("asset {asset_id} not found")))?;

    tracing::info!(%asset_id, kind = %kind, "processing asset");

    // ── 2. Download original to temp dir ────────────────────────────────────
    let tmp = tempfile::TempDir::new()?;
    let ext = original_key.rsplit('.').next().unwrap_or("bin");
    let original = tmp.path().join(format!("original.{ext}"));
    storage::download_file(s3_client, &config.s3_bucket, &original_key, &original).await?;

    // ── 3. Probe metadata ───────────────────────────────────────────────────
    let probe = ffmpeg::probe(&original).await?;

    sqlx::query("UPDATE assets SET duration_ms=$1, width=$2, height=$3, size_bytes=$4 WHERE id=$5")
        .bind(probe.duration_ms)
        .bind(probe.width)
        .bind(probe.height)
        .bind(probe.size_bytes)
        .bind(asset_id)
        .execute(db)
        .await?;

    let asset_id_str = asset_id.to_string();

    // ── 4. Generate variants based on kind ──────────────────────────────────
    match kind.as_str() {
        "video" => {
            process_video(
                &original,
                &asset_id_str,
                &probe,
                db,
                config,
                s3_client,
                tmp.path(),
            )
            .await?;
        }
        "audio" => {
            process_audio(&original, &asset_id_str, db, config, s3_client, tmp.path()).await?;
        }
        "image" => {
            let thumb_path = tmp.path().join("thumbnail.jpg");
            ffmpeg::make_thumbnail(&original, &thumb_path, 0.0).await?;
            let key = format!("variants/{asset_id_str}/thumbnail.jpg");
            storage::upload_file(
                s3_client,
                &config.s3_bucket,
                &key,
                &thumb_path,
                "image/jpeg",
            )
            .await?;
            upsert_variant(db, asset_id, "thumbnail", &key, "image/jpeg", &thumb_path).await?;
        }
        _ => {
            tracing::warn!(%asset_id, kind=%kind, "no processing pipeline for this kind");
        }
    }

    // ── 5. Mark asset ready ─────────────────────────────────────────────────
    sqlx::query("UPDATE assets SET status = 'ready'::asset_status WHERE id = $1")
        .bind(asset_id)
        .execute(db)
        .await?;

    tracing::info!(%asset_id, "asset processing complete");
    Ok(())
}

async fn process_video(
    original: &std::path::Path,
    asset_id_str: &str,
    probe: &ffmpeg::ProbeResult,
    db: &PgPool,
    config: &Config,
    s3_client: &aws_sdk_s3::Client,
    tmp: &std::path::Path,
) -> Result<(), WorkerError> {
    let asset_id = asset_id_str.parse::<Uuid>().unwrap();

    let proxy_path = tmp.join("proxy.mp4");
    let db_clone = db.clone();
    ffmpeg::make_proxy(original, &proxy_path, probe.duration_ms, move |pct| {
        let db = db_clone.clone();
        async move {
            let _ = sqlx::query("UPDATE assets SET progress_pct = $1 WHERE id = $2")
                .bind(pct)
                .bind(asset_id)
                .execute(&db)
                .await;
        }
    })
    .await?;
    let proxy_key = format!("variants/{asset_id_str}/proxy.mp4");
    storage::upload_file(
        s3_client,
        &config.s3_bucket,
        &proxy_key,
        &proxy_path,
        "video/mp4",
    )
    .await?;
    upsert_variant(db, asset_id, "proxy", &proxy_key, "video/mp4", &proxy_path).await?;

    let thumb_offset = probe
        .duration_ms
        .map(|d| (d as f64 / 2000.0).min(1.0))
        .unwrap_or(1.0);
    let thumb_path: PathBuf = tmp.join("thumbnail.jpg");
    ffmpeg::make_thumbnail(original, &thumb_path, thumb_offset).await?;
    let thumb_key = format!("variants/{asset_id_str}/thumbnail.jpg");
    storage::upload_file(
        s3_client,
        &config.s3_bucket,
        &thumb_key,
        &thumb_path,
        "image/jpeg",
    )
    .await?;
    upsert_variant(
        db,
        asset_id,
        "thumbnail",
        &thumb_key,
        "image/jpeg",
        &thumb_path,
    )
    .await?;

    if probe.has_audio {
        let waveform_path = tmp.join("waveform.json");
        ffmpeg::make_waveform(original, &waveform_path).await?;
        let wf_key = format!("variants/{asset_id_str}/waveform.json");
        storage::upload_file(
            s3_client,
            &config.s3_bucket,
            &wf_key,
            &waveform_path,
            "application/json",
        )
        .await?;
        upsert_variant(
            db,
            asset_id,
            "waveform",
            &wf_key,
            "application/json",
            &waveform_path,
        )
        .await?;
    }

    Ok(())
}

async fn process_audio(
    original: &std::path::Path,
    asset_id_str: &str,
    db: &PgPool,
    config: &Config,
    s3_client: &aws_sdk_s3::Client,
    tmp: &std::path::Path,
) -> Result<(), WorkerError> {
    let asset_id = asset_id_str.parse::<Uuid>().unwrap();

    // Normalised AAC proxy — browser-safe, consistent bitrate regardless of
    // original format (wav/ogg/flac/etc.). Frontend falls back to the original
    // file for assets processed before this code landed.
    let proxy_path = tmp.join("proxy.mp4");
    ffmpeg::make_audio_proxy(original, &proxy_path).await?;
    let proxy_key = format!("variants/{asset_id_str}/proxy.mp4");
    storage::upload_file(
        s3_client,
        &config.s3_bucket,
        &proxy_key,
        &proxy_path,
        "audio/mp4",
    )
    .await?;
    upsert_variant(db, asset_id, "proxy", &proxy_key, "audio/mp4", &proxy_path).await?;

    let waveform_path = tmp.join("waveform.json");
    ffmpeg::make_waveform(original, &waveform_path).await?;
    let wf_key = format!("variants/{asset_id_str}/waveform.json");
    storage::upload_file(
        s3_client,
        &config.s3_bucket,
        &wf_key,
        &waveform_path,
        "application/json",
    )
    .await?;
    upsert_variant(
        db,
        asset_id,
        "waveform",
        &wf_key,
        "application/json",
        &waveform_path,
    )
    .await?;

    Ok(())
}

async fn upsert_variant(
    db: &PgPool,
    asset_id: Uuid,
    variant: &str,
    key: &str,
    content_type: &str,
    path: &std::path::Path,
) -> Result<(), WorkerError> {
    let size = std::fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0);
    sqlx::query(
        r#"
        INSERT INTO asset_variants (asset_id, variant, s3_key, content_type, size_bytes)
        VALUES ($1, $2::variant_kind, $3, $4, $5)
        ON CONFLICT (asset_id, variant) DO UPDATE
            SET s3_key = EXCLUDED.s3_key,
                size_bytes = EXCLUDED.size_bytes
        "#,
    )
    .bind(asset_id)
    .bind(variant)
    .bind(key)
    .bind(content_type)
    .bind(size)
    .execute(db)
    .await?;
    Ok(())
}
