use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, sqlx::FromRow, Serialize, ToSchema)]
pub struct ExportJobRow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub requested_by: Uuid,
    pub status: String,
    pub format: String,
    pub resolution: String,
    pub output_key: Option<String>,
    pub progress_pct: i16,
    pub error_msg: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    /// Presigned GET URL for the rendered file. Populated by handlers when
    /// `status = "done"`; null otherwise. Not stored in the DB — generated
    /// on read so the URL stays within its presign expiry window.
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateExportReq {
    /// "mp4" | "webm" | "mov"
    pub format: Option<String>,
    /// "360" | "720" | "1080" | "2160"
    pub resolution: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ExportJobCreated {
    pub job: ExportJobRow,
    /// Redis stream ID that the worker will pick up.
    pub stream_id: String,
}
