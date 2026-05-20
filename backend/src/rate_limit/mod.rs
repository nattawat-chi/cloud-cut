//! Redis-backed rate limiter (§3.10).
//!
//! Two independent counters, both keyed per workspace:
//!
//! 1. **Upload window** — fixed hourly bucket.
//!    Key: `cloudcut:uploads:{workspace_id}:{YYYY-MM-DDTHH}` · TTL 3 600 s
//!
//! 2. **Concurrent exports** — long-lived counter; the worker DECRs on
//!    job completion/failure.
//!    Key: `cloudcut:exports:concurrent:{workspace_id}` · TTL 86 400 s
//!    (safety net so a worker crash can't leak the counter forever).
//!
//! Plan limits (§3.10):
//! | plan | uploads/hour | concurrent exports |
//! |------|-------------:|-------------------:|
//! | free |            5 |                  2 |
//! | pro  |           50 |                 10 |
//! | team |          200 |                 30 |

use chrono::Utc;
use redis::AsyncCommands;
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

const UPLOAD_TTL_SECS: i64 = 3_600;
const EXPORT_TTL_SECS: i64 = 86_400;

fn upload_limit(plan: &str) -> i64 {
    match plan {
        "pro" => 50,
        "team" => 200,
        _ => 5, // free / unknown
    }
}

fn export_concurrent_limit(plan: &str) -> i64 {
    match plan {
        "pro" => 10,
        "team" => 30,
        _ => 2,
    }
}

/// Look up the workspace's plan tier so the right limit applies.
async fn fetch_plan(state: &AppState, workspace_id: Uuid) -> Result<String, AppError> {
    let plan: Option<String> =
        sqlx::query_scalar("SELECT plan::text FROM workspaces WHERE id = $1")
            .bind(workspace_id)
            .fetch_optional(&state.db)
            .await?;
    Ok(plan.unwrap_or_else(|| "free".into()))
}

/// Current usage snapshot for a workspace — used by `GET /workspaces/:id/usage`
/// so the frontend can show "3/50 uploads this hour" instead of just the cap.
pub struct UsageSnapshot {
    pub plan: String,
    pub uploads_used: i64,
    pub uploads_limit: i64,
    /// Seconds until the upload bucket rolls — derived from Redis TTL on the
    /// hourly key (or 0 when the bucket hasn't been written this hour yet).
    pub uploads_reset_in_secs: i64,
    pub exports_concurrent_used: i64,
    pub exports_concurrent_limit: i64,
}

/// Read the current upload + concurrent-export counters without mutating them.
/// Safe to poll from the frontend at ~10s cadence; pure GETs only.
pub async fn snapshot_usage(
    state: &AppState,
    workspace_id: Uuid,
) -> Result<UsageSnapshot, AppError> {
    let plan = fetch_plan(state, workspace_id).await?;
    let uploads_limit = upload_limit(&plan);
    let exports_concurrent_limit = export_concurrent_limit(&plan);

    let bucket = Utc::now().format("%Y-%m-%dT%H").to_string();
    let upload_key = format!("cloudcut:uploads:{workspace_id}:{bucket}");
    let export_key = format!("cloudcut:exports:concurrent:{workspace_id}");

    let mut conn = redis_conn(state).await?;

    // Missing key → 0. Negative values shouldn't be possible but clamp anyway
    // so a corrupted counter never produces nonsensical UI numbers.
    let uploads_used: i64 = conn
        .get::<_, Option<i64>>(&upload_key)
        .await
        .map_err(|e| AppError::internal(format!("redis get uploads: {e}")))?
        .unwrap_or(0)
        .max(0);
    let exports_concurrent_used: i64 = conn
        .get::<_, Option<i64>>(&export_key)
        .await
        .map_err(|e| AppError::internal(format!("redis get exports: {e}")))?
        .unwrap_or(0)
        .max(0);

    // Redis TTL returns -1 if key has no TTL, -2 if key doesn't exist.
    let ttl: i64 = conn
        .ttl(&upload_key)
        .await
        .map_err(|e| AppError::internal(format!("redis ttl: {e}")))?;
    let uploads_reset_in_secs = if ttl > 0 { ttl } else { 0 };

    Ok(UsageSnapshot {
        plan,
        uploads_used,
        uploads_limit,
        uploads_reset_in_secs,
        exports_concurrent_used,
        exports_concurrent_limit,
    })
}

async fn redis_conn(state: &AppState) -> Result<redis::aio::MultiplexedConnection, AppError> {
    state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| AppError::internal(format!("redis connect: {e}")))
}

/// Hourly upload-rate check.
///
/// Atomically INCRs the bucket, sets TTL on first write, and rolls the
/// counter back on overrun so burst traffic doesn't permanently bias the
/// fixed window.
pub async fn check_upload(state: &AppState, workspace_id: Uuid) -> Result<(), AppError> {
    let plan = fetch_plan(state, workspace_id).await?;
    let limit = upload_limit(&plan);

    let bucket = Utc::now().format("%Y-%m-%dT%H").to_string();
    let key = format!("cloudcut:uploads:{workspace_id}:{bucket}");

    let mut conn = redis_conn(state).await?;
    let count: i64 = conn
        .incr(&key, 1i64)
        .await
        .map_err(|e| AppError::internal(format!("redis incr: {e}")))?;

    if count == 1 {
        // Best-effort: missing TTL just means the bucket sticks for a bit,
        // not a correctness issue.
        let _: Result<bool, _> = conn.expire(&key, UPLOAD_TTL_SECS).await;
    }

    if count > limit {
        let _: Result<i64, _> = conn.decr(&key, 1i64).await;
        return Err(AppError::RateLimited(format!(
            "upload limit reached ({limit}/hour for {plan} plan); try again later or upgrade",
        )));
    }
    Ok(())
}

/// Concurrent-export slot check.  Caller takes a slot on success; the
/// worker is responsible for calling [`release_export_slot`] when the job
/// reaches a terminal state.
pub async fn check_concurrent_exports(
    state: &AppState,
    workspace_id: Uuid,
) -> Result<(), AppError> {
    let plan = fetch_plan(state, workspace_id).await?;
    let limit = export_concurrent_limit(&plan);

    let key = format!("cloudcut:exports:concurrent:{workspace_id}");
    let mut conn = redis_conn(state).await?;

    let count: i64 = conn
        .incr(&key, 1i64)
        .await
        .map_err(|e| AppError::internal(format!("redis incr: {e}")))?;

    if count == 1 {
        let _: Result<bool, _> = conn.expire(&key, EXPORT_TTL_SECS).await;
    }

    if count > limit {
        let _: Result<i64, _> = conn.decr(&key, 1i64).await;
        return Err(AppError::RateLimited(format!(
            "{limit} concurrent exports already running on {plan} plan; wait for one to finish",
        )));
    }
    Ok(())
}

/// Free up an export slot.  Worker calls this in its job-completion path
/// (success or failure).  Errors are swallowed — a missed DECR is much
/// less harmful than crashing the worker's cleanup.
#[allow(dead_code)]
pub async fn release_export_slot(state: &AppState, workspace_id: Uuid) {
    let key = format!("cloudcut:exports:concurrent:{workspace_id}");
    if let Ok(mut conn) = redis_conn(state).await {
        let _: Result<i64, _> = conn.decr(&key, 1i64).await;
    }
}

/// Look up the workspace_id for a project so handlers that only have a
/// project_id (like `create_export`) can run the workspace-keyed check.
pub async fn workspace_for_project(state: &AppState, project_id: Uuid) -> Result<Uuid, AppError> {
    let ws: Option<Uuid> = sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_optional(&state.db)
        .await?;
    ws.ok_or_else(|| AppError::NotFound("project".into()))
}
