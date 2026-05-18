use aws_sdk_s3::presigning::PresigningConfig;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use redis::AsyncCommands;
use std::time::Duration;
use uuid::Uuid;
use validator::Validate;

use crate::{
    assets::models::{
        AssetRow, ListAssetsQuery, PagedAssets, PresignRequest, PresignResponse, UpdateStatusReq,
    },
    auth::extractor::AuthUser,
    error::AppError,
    state::AppState,
};

// ─── GET /api/v1/workspaces/:workspace_id/assets ──────────────────────────────

pub async fn list_assets(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Query(q): Query<ListAssetsQuery>,
) -> Result<Json<PagedAssets>, AppError> {
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let limit = q.limit.unwrap_or(40).clamp(1, 200);
    let cursor_id = q
        .cursor
        .as_deref()
        .map(|c| {
            let bytes = URL_SAFE_NO_PAD
                .decode(c)
                .map_err(|_| AppError::BadRequest("invalid cursor".into()))?;
            String::from_utf8(bytes)
                .map_err(|_| AppError::BadRequest("invalid cursor".into()))?
                .parse::<Uuid>()
                .map_err(|_| AppError::BadRequest("invalid cursor".into()))
        })
        .transpose()?
        .unwrap_or(Uuid::max());

    let mut items = sqlx::query_as::<_, AssetRow>(
        r#"
        SELECT id, workspace_id, name, kind::text AS kind, size_bytes, duration_ms, width, height,
               original_key, status::text AS status, progress_pct, uploaded_by, created_at
        FROM assets
        WHERE workspace_id = $1
          AND ($2::text IS NULL OR kind = $2::asset_kind)
          AND ($3::text IS NULL OR status = $3::asset_status)
          AND id < $4
        ORDER BY id DESC
        LIMIT $5
        "#,
    )
    .bind(workspace_id)
    .bind(q.kind.as_deref())
    .bind(q.status.as_deref())
    .bind(cursor_id)
    .bind(limit + 1)
    .fetch_all(&state.db)
    .await?;

    let has_more = items.len() as i64 > limit;
    if has_more { items.truncate(limit as usize); }
    let next_cursor = if has_more {
        items.last().map(|r| URL_SAFE_NO_PAD.encode(r.id.to_string()))
    } else {
        None
    };

    Ok(Json(PagedAssets { items, next_cursor }))
}

// ─── POST /api/v1/workspaces/:workspace_id/assets/presign ────────────────────

pub async fn presign_upload(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(req): Json<PresignRequest>,
) -> Result<(StatusCode, Json<PresignResponse>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let valid_kinds = ["video", "audio", "image", "font"];
    if !valid_kinds.contains(&req.kind.as_str()) {
        return Err(AppError::BadRequest(format!(
            "kind must be one of: {}",
            valid_kinds.join(", ")
        )));
    }

    let asset_id = Uuid::new_v4();
    let ext = extension_from_filename(&req.filename);
    let s3_key = format!(
        "originals/{workspace_id}/{asset_id}/original.{ext}"
    );
    let content_type = content_type_for_kind(&req.kind, &ext);

    // Insert asset row with status = 'uploading'
    sqlx::query(
        r#"
        INSERT INTO assets (id, workspace_id, name, kind, size_bytes, original_key, uploaded_by)
        VALUES ($1, $2, $3, $4::asset_kind, $5, $6, $7)
        "#,
    )
    .bind(asset_id)
    .bind(workspace_id)
    .bind(&req.filename)
    .bind(&req.kind)
    .bind(req.size_bytes)
    .bind(&s3_key)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // Generate presigned PUT URL (MinIO / S3)
    let expires = state.config.s3_presign_expires_secs;
    let presign_cfg = PresigningConfig::builder()
        .expires_in(Duration::from_secs(expires))
        .build()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let presigned = state
        .s3
        .put_object()
        .bucket(&state.config.s3_bucket)
        .key(&s3_key)
        .content_type(&content_type)
        .presigned(presign_cfg)
        .await
        .map_err(|e| AppError::internal(format!("s3 presign: {e}")))?;

    Ok((
        StatusCode::CREATED,
        Json(PresignResponse {
            asset_id,
            upload_url: presigned.uri().to_string(),
            s3_key,
            expires_in: expires,
        }),
    ))
}

// ─── PATCH /api/v1/assets/:id/status ─────────────────────────────────────────
/// Called by the worker (or the client after upload) to advance the asset state machine.

pub async fn update_asset_status(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(asset_id): Path<Uuid>,
    Json(req): Json<UpdateStatusReq>,
) -> Result<Json<AssetRow>, AppError> {
    let valid_statuses = ["processing", "ready", "error"];
    if !valid_statuses.contains(&req.status.as_str()) {
        return Err(AppError::BadRequest(format!(
            "status must be one of: {}",
            valid_statuses.join(", ")
        )));
    }

    // Verify caller is a workspace member for this asset
    let ws_id: Option<Uuid> =
        sqlx::query_scalar("SELECT workspace_id FROM assets WHERE id = $1")
            .bind(asset_id)
            .fetch_optional(&state.db)
            .await?;
    let ws_id = ws_id.ok_or_else(|| AppError::NotFound("asset".into()))?;
    require_workspace_member(&state, ws_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, AssetRow>(
        r#"
        UPDATE assets
        SET status      = $1::asset_status,
            size_bytes  = COALESCE($2, size_bytes),
            duration_ms = COALESCE($3, duration_ms),
            width       = COALESCE($4, width),
            height      = COALESCE($5, height)
        WHERE id = $6
        RETURNING id, workspace_id, name, kind::text AS kind, size_bytes, duration_ms, width, height,
                  original_key, status::text AS status, progress_pct, uploaded_by, created_at
        "#,
    )
    .bind(&req.status)
    .bind(req.size_bytes)
    .bind(req.duration_ms)
    .bind(req.width)
    .bind(req.height)
    .bind(asset_id)
    .fetch_one(&state.db)
    .await?;

    // When the client signals upload completion, hand the asset to the worker.
    if req.status == "processing" {
        if let Err(e) = enqueue_processing(&state, asset_id).await {
            tracing::warn!(%asset_id, error=%e, "asset enqueue failed (worker won't pick up)");
        }
    }

    Ok(Json(row))
}

// ─── DELETE /api/v1/assets/:id ───────────────────────────────────────────────
/// Removes the asset row + its variants. S3 objects are left orphaned —
/// a periodic janitor job (not implemented in this scope) would sweep them.
/// Returns 409 if any clip in any project still references the asset.
pub async fn delete_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(asset_id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    let ws_id: Option<Uuid> =
        sqlx::query_scalar("SELECT workspace_id FROM assets WHERE id = $1")
            .bind(asset_id)
            .fetch_optional(&state.db)
            .await?;
    let ws_id = ws_id.ok_or_else(|| AppError::NotFound("asset".into()))?;
    require_workspace_member(&state, ws_id, auth.user_id).await?;

    // Block delete while any clip still references it — otherwise the timeline
    // would render orphan clips that crash on Inspector lookup.
    let in_use: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM clips WHERE asset_id = $1)",
    )
    .bind(asset_id)
    .fetch_one(&state.db)
    .await?;
    if in_use {
        return Err(AppError::Conflict(
            "asset is used by one or more clips — remove the clips first".into(),
        ));
    }

    // ON DELETE CASCADE on asset_variants takes care of the variants table.
    sqlx::query("DELETE FROM assets WHERE id = $1")
        .bind(asset_id)
        .execute(&state.db)
        .await?;

    tracing::info!(%asset_id, "asset deleted");
    Ok(axum::http::StatusCode::NO_CONTENT)
}

const ASSETS_STREAM: &str = "cloudcut:assets";

async fn enqueue_processing(state: &AppState, asset_id: Uuid) -> Result<(), AppError> {
    let mut conn = state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| AppError::internal(format!("redis connect: {e}")))?;
    let id: String = conn
        .xadd(ASSETS_STREAM, "*", &[("asset_id", asset_id.to_string())])
        .await
        .map_err(|e| AppError::internal(format!("xadd: {e}")))?;
    tracing::info!(%asset_id, stream_id=%id, "asset enqueued for processing");
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

fn extension_from_filename(filename: &str) -> String {
    std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase()
}

fn content_type_for_kind(kind: &str, ext: &str) -> String {
    match kind {
        "video" => match ext {
            "mp4" | "m4v" => "video/mp4",
            "mov" => "video/quicktime",
            "webm" => "video/webm",
            _ => "video/mp4",
        },
        "audio" => match ext {
            "mp3" => "audio/mpeg",
            "aac" => "audio/aac",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            _ => "audio/mpeg",
        },
        "image" => match ext {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "image/jpeg",
        },
        "font" => "font/opentype",
        _ => "application/octet-stream",
    }
    .to_owned()
}
