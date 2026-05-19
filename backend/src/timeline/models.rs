use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ─── Track ────────────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct TrackRow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub kind: String,
    pub name: String,
    pub position: i16,
    pub muted: bool,
    pub locked: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTrackReq {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    /// "video" | "audio" | "subtitle"
    pub kind: String,
    pub position: Option<i16>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrackReq {
    pub name: Option<String>,
    pub muted: Option<bool>,
    pub locked: Option<bool>,
    pub position: Option<i16>,
}

// ─── Clip ─────────────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct ClipRow {
    pub id: Uuid,
    pub track_id: Uuid,
    pub asset_id: Option<Uuid>,
    pub pos_ms: i64,
    pub dur_ms: i64,
    pub trim_in_ms: i64,
    pub trim_out_ms: i64,
    pub speed: f64,
    pub name: String,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddClipReq {
    pub asset_id: Option<Uuid>,
    #[validate(range(min = 0))]
    pub pos_ms: i64,
    #[validate(range(min = 400))]
    pub dur_ms: i64,
    #[validate(length(min = 1, max = 255))]
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClipReq {
    pub pos_ms: Option<i64>,
    pub dur_ms: Option<i64>,
    pub trim_in_ms: Option<i64>,
    pub trim_out_ms: Option<i64>,
    pub speed: Option<f64>,
    pub track_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct SplitClipReq {
    /// Position within the clip (0 < split_at_ms < dur_ms)
    pub split_at_ms: i64,
}

// ─── Clip effect ──────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct EffectRow {
    pub id: Uuid,
    pub clip_id: Uuid,
    pub r#type: String,
    pub value: f64,
    pub enabled: bool,
    pub position: i16,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddEffectReq {
    /// Must match the `effect_type` enum in Postgres.
    pub r#type: String,
    pub value: Option<f64>,
    pub position: Option<i16>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEffectReq {
    pub value: Option<f64>,
    pub enabled: Option<bool>,
    pub position: Option<i16>,
}

// ─── Bulk timeline load ───────────────────────────────────────────────────────

/// Full timeline snapshot returned by GET /projects/:id/timeline
#[derive(Debug, Serialize)]
pub struct TimelineSnapshot {
    pub tracks: Vec<TrackRow>,
    pub clips: Vec<ClipRow>,
    pub effects: std::collections::HashMap<String, Vec<EffectRow>>,
}
