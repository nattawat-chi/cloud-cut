#![allow(dead_code)] // `append` is wired by timeline mutations (Phase 5).
//! Persistence layer for the `operation_logs` table.
//!
//! `operation_logs` is monthly-partitioned by `applied_at` (see migration
//! 0001_init.sql) and uses `id BIGSERIAL` as the per-project sequence
//! number consumed by [`sync::list_operations`](super::sync::list_operations).
//!
//! All timeline mutation handlers should call [`append`] inside the same
//! transaction as the entity write so the log and state can never diverge.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use super::dto::OperationEntry;

/// Append one operation and return its assigned `server_seq` (the BIGSERIAL `id`).
pub async fn append(
    pool:       &PgPool,
    project_id: Uuid,
    user_id:    Uuid,
    op_type:    &str,
    payload:    &Value,
) -> Result<i64, AppError> {
    let seq: i64 = sqlx::query_scalar(
        "INSERT INTO operation_logs (project_id, user_id, op_type, payload) \
         VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(project_id)
    .bind(user_id)
    .bind(op_type)
    .bind(payload)
    .fetch_one(pool)
    .await?;
    Ok(seq)
}

/// Read operations for `project_id` with `seq > after_seq`, up to `limit`.
pub async fn list_since(
    pool:       &PgPool,
    project_id: Uuid,
    after_seq:  i64,
    limit:      i64,
) -> Result<Vec<OperationEntry>, AppError> {
    let rows: Vec<(i64, Uuid, String, Value, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT id, user_id, op_type, payload, applied_at
        FROM   operation_logs
        WHERE  project_id = $1
          AND  id         > $2
        ORDER  BY id ASC
        LIMIT  $3
        "#,
    )
    .bind(project_id)
    .bind(after_seq)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(seq, user_id, op_type, payload, applied_at)| OperationEntry {
            seq,
            user_id,
            op_type,
            payload,
            applied_at,
        })
        .collect())
}
