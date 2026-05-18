//! Redis-backed rate limiter (§3.10).
//!
//! Two independent counters per workspace:
//!
//! 1. **Upload window** — fixed hourly bucket.
//!    Key: `cloudcut:uploads:{workspace_id}:{YYYY-MM-DDTHH}`
//!    TTL: 3 600 s  (expires automatically at the end of the hour)
//!
//! 2. **Concurrent exports** — persistent counter, decremented on job completion.
//!    Key: `cloudcut:exports:concurrent:{workspace_id}`
//!    TTL: 86 400 s (safety net against leaked counters if a worker crashes)
//!
//! Plan limits (§3.10):
//! | plan | uploads / hour | concurrent exports |
//! |------|---------------:|-------------------:|
//! | free |              5 |                  2 |
//! | pro  |             50 |                 10 |
//! | team |            200 |                 30 |

use chrono::Utc;
use redis::aio::ConnectionManager;
use uuid::Uuid;

use crate::error::AppError;

// ─── Plan limits ───────────────────────────────────────────────────────────────

fn upload_limit(plan: &str) -> i64 {
    match plan {
        "pro"  => 50,
        "team" => 200,
        _      => 5,   // free
    }
}

fn export_concurrent_limit(plan: &str) -> i64 {
    match plan {
        "pro"  => 10,
        "team" => 30,
        _      => 2,   // free
    }
}

// ─── RateLimiter ───────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct RateLimiter {
    conn: ConnectionManager,
}

impl RateLimiter {
    pub fn new(conn: ConnectionManager) -> Self {
        Self { conn }
    }

    /// Check the hourly upload rate for a workspace.
    ///
    /// Atomically increments the fixed-window counter and sets a TTL on the
    /// first increment.  Decrements and returns `RateLimited` when the plan
    /// limit is exceeded.
    pub async fn check_upload(
        &self,
        workspace_id: Uuid,
        plan: &str,
    ) -> Result<(), AppError> {
        let limit = upload_limit(plan);
        let bucket = Utc::now().format("%Y-%m-%dT%H").to_string();
        let key = format!("cloudcut:uploads:{workspace_id}:{bucket}");

        let mut conn = self.conn.clone();

        let count: i64 = redis::cmd("INCR")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("redis INCR: {e}")))?;

        // Set expiry only on the first write so we don't reset the window.
        if count == 1 {
            let _: Result<bool, _> = redis::cmd("EXPIRE")
                .arg(&key)
                .arg(3600i64)
                .query_async(&mut conn)
                .await;
        }

        if count > limit {
            // Roll back so the counter doesn't over-drift under burst traffic.
            let _: Result<i64, _> = redis::cmd("DECR")
                .arg(&key)
                .query_async(&mut conn)
                .await;

            return Err(AppError::RateLimited(format!(
                "upload limit {limit}/hour exceeded; upgrade your plan or retry next hour"
            )));
        }

        Ok(())
    }

    /// Check concurrent export capacity for a workspace.
    ///
    /// Increments the active-export counter.  Decrements and returns
    /// `RateLimited` when the plan limit is already saturated.
    /// Callers **must** call [`release_export_slot`] when the job finishes
    /// (success, failure, or cancellation) to avoid a counter leak.
    pub async fn check_concurrent_exports(
        &self,
        workspace_id: Uuid,
        plan: &str,
    ) -> Result<(), AppError> {
        let limit = export_concurrent_limit(plan);
        let key = format!("cloudcut:exports:concurrent:{workspace_id}");

        let mut conn = self.conn.clone();

        let count: i64 = redis::cmd("INCR")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("redis INCR: {e}")))?;

        // Safety TTL: prevents stale counts if the worker process crashes.
        if count == 1 {
            let _: Result<bool, _> = redis::cmd("EXPIRE")
                .arg(&key)
                .arg(86_400i64)
                .query_async(&mut conn)
                .await;
        }

        if count > limit {
            let _: Result<i64, _> = redis::cmd("DECR")
                .arg(&key)
                .query_async(&mut conn)
                .await;

            return Err(AppError::RateLimited(format!(
                "concurrent export limit {limit} reached; wait for a running export to finish"
            )));
        }

        Ok(())
    }

    /// Decrement the concurrent export counter once a job completes or fails.
    ///
    /// Errors are swallowed — a missed decrement is less harmful than
    /// crashing the caller's cleanup path.
    pub async fn release_export_slot(&self, workspace_id: Uuid) {
        let key = format!("cloudcut:exports:concurrent:{workspace_id}");
        let mut conn = self.conn.clone();
        let _: Result<i64, _> = redis::cmd("DECR")
            .arg(&key)
            .query_async(&mut conn)
            .await;
    }
}
