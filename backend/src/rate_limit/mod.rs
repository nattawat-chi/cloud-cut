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
        "pro"  => 50,
        "team" => 200,
        _      => 5,   // free / unknown
    }
}

fn export_concurrent_limit(plan: &str) -> i64 {
    match plan {
        "pro"  => 10,
        "team" => 30,
        _      => 2,
    }
}

/// Look up the workspace's plan tier so the right limit applies.
async fn fetch_plan(state: &AppState, workspace_id: Uuid) -> Result<String, AppError> {
    let plan: Option<String> = sqlx::query_scalar(
        "SELECT plan::text FROM workspaces WHERE id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await?;
    Ok(plan.unwrap_or_else(|| "free".into()))
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
    state:        &AppState,
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
pub async fn workspace_for_project(
    state:      &AppState,
    project_id: Uuid,
) -> Result<Uuid, AppError> {
    let ws: Option<Uuid> = sqlx::query_scalar(
        "SELECT workspace_id FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;
    ws.ok_or_else(|| AppError::NotFound("project".into()))
}
