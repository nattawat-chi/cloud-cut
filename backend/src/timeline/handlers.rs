use std::collections::HashMap;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    state::AppState,
    timeline::models::{
        AddClipReq, AddEffectReq, ClipRow, CreateTrackReq, EffectRow, SplitClipReq,
        TimelineSnapshot, TrackRow, UpdateClipReq, UpdateEffectReq, UpdateTrackReq,
    },
};

// ─── GET /api/v1/projects/:id/timeline ────────────────────────────────────────
/// Bulk-load everything needed to render the timeline in one request.

pub async fn get_timeline(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<TimelineSnapshot>, AppError> {
    require_project_access(&state, project_id, auth.user_id).await?;

    let (tracks, clips, all_effects) = tokio::try_join!(
        fetch_tracks(&state, project_id),
        fetch_clips_for_project(&state, project_id),
        fetch_effects_for_project(&state, project_id),
    )?;

    // Group effects by clip_id string key (matches frontend store shape)
    let mut effects: HashMap<String, Vec<EffectRow>> = HashMap::new();
    for fx in all_effects {
        effects.entry(fx.clip_id.to_string()).or_default().push(fx);
    }

    Ok(Json(TimelineSnapshot { tracks, clips, effects }))
}

// ─── Tracks ───────────────────────────────────────────────────────────────────

pub async fn list_tracks(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<TrackRow>>, AppError> {
    require_project_access(&state, project_id, auth.user_id).await?;
    Ok(Json(fetch_tracks(&state, project_id).await?))
}

pub async fn create_track(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(project_id): Path<Uuid>,
    Json(req): Json<CreateTrackReq>,
) -> Result<(StatusCode, Json<TrackRow>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let valid_kinds = ["video", "audio", "subtitle"];
    if !valid_kinds.contains(&req.kind.as_str()) {
        return Err(AppError::BadRequest(format!(
            "kind must be one of: {}",
            valid_kinds.join(", ")
        )));
    }

    let row = sqlx::query_as::<_, TrackRow>(
        r#"
        INSERT INTO tracks (project_id, kind, name, position)
        VALUES ($1, $2::track_kind, $3, COALESCE($4,
            (SELECT COALESCE(MAX(position), -1) + 1 FROM tracks WHERE project_id = $1)))
        RETURNING id, project_id, kind, name, position, muted, locked, created_at
        "#,
    )
    .bind(project_id)
    .bind(&req.kind)
    .bind(&req.name)
    .bind(req.position)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update_track(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(track_id): Path<Uuid>,
    Json(req): Json<UpdateTrackReq>,
) -> Result<Json<TrackRow>, AppError> {
    let project_id = track_project_id(&state, track_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, TrackRow>(
        r#"
        UPDATE tracks
        SET name     = COALESCE($1, name),
            muted    = COALESCE($2, muted),
            locked   = COALESCE($3, locked),
            position = COALESCE($4, position)
        WHERE id = $5
        RETURNING id, project_id, kind, name, position, muted, locked, created_at
        "#,
    )
    .bind(req.name.as_deref())
    .bind(req.muted)
    .bind(req.locked)
    .bind(req.position)
    .bind(track_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

pub async fn delete_track(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(track_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let project_id = track_project_id(&state, track_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    sqlx::query("DELETE FROM tracks WHERE id = $1")
        .bind(track_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Clips ────────────────────────────────────────────────────────────────────

pub async fn add_clip(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(track_id): Path<Uuid>,
    Json(req): Json<AddClipReq>,
) -> Result<(StatusCode, Json<ClipRow>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    let project_id = track_project_id(&state, track_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, ClipRow>(
        r#"
        INSERT INTO clips (track_id, asset_id, pos_ms, dur_ms, name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms,
                  speed, name, version, created_at, updated_at
        "#,
    )
    .bind(track_id)
    .bind(req.asset_id)
    .bind(req.pos_ms.max(0))
    .bind(req.dur_ms.max(400))
    .bind(&req.name)
    .fetch_one(&state.db)
    .await?;

    log_operation(&state, project_id, auth.user_id, "add_clip", &row).await;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update_clip(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(clip_id): Path<Uuid>,
    Json(req): Json<UpdateClipReq>,
) -> Result<Json<ClipRow>, AppError> {
    let (project_id, track_id) = clip_project_track(&state, clip_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let target_track = req.track_id.unwrap_or(track_id);

    let row = sqlx::query_as::<_, ClipRow>(
        r#"
        UPDATE clips
        SET track_id    = $1,
            pos_ms      = GREATEST(0, COALESCE($2, pos_ms)),
            dur_ms      = GREATEST(400, COALESCE($3, dur_ms)),
            trim_in_ms  = COALESCE($4, trim_in_ms),
            trim_out_ms = COALESCE($5, trim_out_ms),
            speed       = COALESCE($6, speed),
            version     = version + 1
        WHERE id = $7
        RETURNING id, track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms,
                  speed, name, version, created_at, updated_at
        "#,
    )
    .bind(target_track)
    .bind(req.pos_ms)
    .bind(req.dur_ms)
    .bind(req.trim_in_ms)
    .bind(req.trim_out_ms)
    .bind(req.speed)
    .bind(clip_id)
    .fetch_one(&state.db)
    .await?;

    log_operation(&state, project_id, auth.user_id, "update_clip", &row).await;
    Ok(Json(row))
}

pub async fn delete_clip(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(clip_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (project_id, _) = clip_project_track(&state, clip_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    sqlx::query("DELETE FROM clips WHERE id = $1")
        .bind(clip_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Split a clip at `split_at_ms` relative to the clip start.
pub async fn split_clip(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(clip_id): Path<Uuid>,
    Json(req): Json<SplitClipReq>,
) -> Result<Json<Vec<ClipRow>>, AppError> {
    let (project_id, _) = clip_project_track(&state, clip_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let original = fetch_clip(&state, clip_id).await?;

    if req.split_at_ms <= 200 || req.split_at_ms >= original.dur_ms - 200 {
        return Err(AppError::BadRequest(
            "split point must be at least 200ms from either edge".into(),
        ));
    }

    let right_dur = original.dur_ms - req.split_at_ms;
    let right_pos = original.pos_ms + req.split_at_ms;

    // Shorten left clip in-place
    let left = sqlx::query_as::<_, ClipRow>(
        r#"
        UPDATE clips SET dur_ms = $1, version = version + 1 WHERE id = $2
        RETURNING id, track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms,
                  speed, name, version, created_at, updated_at
        "#,
    )
    .bind(req.split_at_ms)
    .bind(clip_id)
    .fetch_one(&state.db)
    .await?;

    // Insert right clip
    let right = sqlx::query_as::<_, ClipRow>(
        r#"
        INSERT INTO clips (track_id, asset_id, pos_ms, dur_ms, trim_in_ms, name)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms,
                  speed, name, version, created_at, updated_at
        "#,
    )
    .bind(original.track_id)
    .bind(original.asset_id)
    .bind(right_pos)
    .bind(right_dur)
    .bind(original.trim_in_ms + req.split_at_ms)
    .bind(&original.name)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(vec![left, right]))
}

// ─── Effects ──────────────────────────────────────────────────────────────────

pub async fn add_effect(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(clip_id): Path<Uuid>,
    Json(req): Json<AddEffectReq>,
) -> Result<(StatusCode, Json<EffectRow>), AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    let (project_id, _) = clip_project_track(&state, clip_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, EffectRow>(
        r#"
        INSERT INTO clip_effects (clip_id, type, value, position)
        VALUES ($1, $2::effect_type, $3,
            COALESCE($4, (SELECT COALESCE(MAX(position), -1) + 1 FROM clip_effects WHERE clip_id = $1)))
        RETURNING id, clip_id, type, value, enabled, position, created_at
        "#,
    )
    .bind(clip_id)
    .bind(&req.r#type)
    .bind(req.value.unwrap_or(0.0))
    .bind(req.position)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update_effect(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(effect_id): Path<Uuid>,
    Json(req): Json<UpdateEffectReq>,
) -> Result<Json<EffectRow>, AppError> {
    let (project_id, _clip_id) = effect_project_clip(&state, effect_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    let row = sqlx::query_as::<_, EffectRow>(
        r#"
        UPDATE clip_effects
        SET value    = COALESCE($1, value),
            enabled  = COALESCE($2, enabled),
            position = COALESCE($3, position)
        WHERE id = $4
        RETURNING id, clip_id, type, value, enabled, position, created_at
        "#,
    )
    .bind(req.value)
    .bind(req.enabled)
    .bind(req.position)
    .bind(effect_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

pub async fn delete_effect(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(effect_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (project_id, _) = effect_project_clip(&state, effect_id).await?;
    require_project_access(&state, project_id, auth.user_id).await?;

    sqlx::query("DELETE FROM clip_effects WHERE id = $1")
        .bind(effect_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

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

    let workspace_id = workspace_id.ok_or_else(|| AppError::NotFound("project".into()))?;

    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2)",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    if is_member { Ok(()) } else { Err(AppError::Forbidden) }
}

async fn track_project_id(state: &AppState, track_id: Uuid) -> Result<Uuid, AppError> {
    sqlx::query_scalar::<_, Uuid>("SELECT project_id FROM tracks WHERE id = $1")
        .bind(track_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("track".into()))
}

async fn clip_project_track(
    state: &AppState,
    clip_id: Uuid,
) -> Result<(Uuid, Uuid), AppError> {
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT t.project_id, c.track_id FROM clips c JOIN tracks t ON t.id = c.track_id WHERE c.id = $1",
    )
    .bind(clip_id)
    .fetch_optional(&state.db)
    .await?;
    row.ok_or_else(|| AppError::NotFound("clip".into()))
}

async fn effect_project_clip(
    state: &AppState,
    effect_id: Uuid,
) -> Result<(Uuid, Uuid), AppError> {
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        r#"SELECT t.project_id, ce.clip_id
           FROM clip_effects ce
           JOIN clips c ON c.id = ce.clip_id
           JOIN tracks t ON t.id = c.track_id
           WHERE ce.id = $1"#,
    )
    .bind(effect_id)
    .fetch_optional(&state.db)
    .await?;
    row.ok_or_else(|| AppError::NotFound("effect".into()))
}

async fn fetch_clip(state: &AppState, clip_id: Uuid) -> Result<ClipRow, AppError> {
    sqlx::query_as::<_, ClipRow>(
        "SELECT id, track_id, asset_id, pos_ms, dur_ms, trim_in_ms, trim_out_ms,
                speed, name, version, created_at, updated_at
         FROM clips WHERE id = $1",
    )
    .bind(clip_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("clip".into()))
}

async fn fetch_tracks(state: &AppState, project_id: Uuid) -> Result<Vec<TrackRow>, AppError> {
    Ok(sqlx::query_as::<_, TrackRow>(
        "SELECT id, project_id, kind, name, position, muted, locked, created_at
         FROM tracks WHERE project_id = $1 ORDER BY position",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?)
}

async fn fetch_clips_for_project(
    state: &AppState,
    project_id: Uuid,
) -> Result<Vec<ClipRow>, AppError> {
    Ok(sqlx::query_as::<_, ClipRow>(
        r#"SELECT c.id, c.track_id, c.asset_id, c.pos_ms, c.dur_ms, c.trim_in_ms, c.trim_out_ms,
                  c.speed, c.name, c.version, c.created_at, c.updated_at
           FROM clips c
           JOIN tracks t ON t.id = c.track_id
           WHERE t.project_id = $1
           ORDER BY c.pos_ms"#,
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?)
}

async fn fetch_effects_for_project(
    state: &AppState,
    project_id: Uuid,
) -> Result<Vec<EffectRow>, AppError> {
    Ok(sqlx::query_as::<_, EffectRow>(
        r#"SELECT ce.id, ce.clip_id, ce.type, ce.value, ce.enabled, ce.position, ce.created_at
           FROM clip_effects ce
           JOIN clips c ON c.id = ce.clip_id
           JOIN tracks t ON t.id = c.track_id
           WHERE t.project_id = $1
           ORDER BY ce.position"#,
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?)
}

/// Fire-and-forget operation log — failures are non-fatal.
async fn log_operation(
    state: &AppState,
    project_id: Uuid,
    user_id: Uuid,
    op_type: &str,
    payload: &impl serde::Serialize,
) {
    let payload_json = match serde_json::to_value(payload) {
        Ok(v) => v,
        Err(_) => return,
    };
    let _ = sqlx::query(
        "INSERT INTO operation_logs (project_id, user_id, op_type, payload) VALUES ($1, $2, $3, $4)",
    )
    .bind(project_id)
    .bind(user_id)
    .bind(op_type)
    .bind(payload_json)
    .execute(&state.db)
    .await;
}
