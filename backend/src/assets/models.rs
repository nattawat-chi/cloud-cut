use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct AssetRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub kind: String,
    pub size_bytes: i64,
    pub duration_ms: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub original_key: String,
    pub status: String,
    /// 0–100 — updated by the worker from ffmpeg's `-progress pipe:1` stream.
    pub progress_pct: i16,
    pub uploaded_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct PresignRequest {
    /// Original filename — used to derive the MIME type and extension.
    #[validate(length(min = 1, max = 255))]
    pub filename: String,
    /// "video" | "audio" | "image" | "font"
    pub kind: String,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize)]
pub struct PresignResponse {
    /// The asset row already inserted (status = "uploading").
    pub asset_id: Uuid,
    /// Presigned PUT URL — client uploads directly to MinIO/S3.
    pub upload_url: String,
    /// S3 object key for reference.
    pub s3_key: String,
    /// URL TTL in seconds.
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStatusReq {
    /// "processing" | "ready" | "error"
    pub status: String,
    pub size_bytes: Option<i64>,
    pub duration_ms: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ListAssetsQuery {
    pub kind: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PagedAssets {
    pub items: Vec<AssetRow>,
    pub next_cursor: Option<String>,
}
