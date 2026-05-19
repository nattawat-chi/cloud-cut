//! Redis Streams consumer — `XREADGROUP` + `XACK` + dead-letter on max retries.
//!
//! Two streams:
//!   `cloudcut:exports`       — export jobs (written by backend)
//!   `cloudcut:assets`        — asset processing jobs (written by backend)
//!
//! Consumer group: `cloudcut-workers`
//! Consumer name:  `worker-{hostname}`

use std::sync::Arc;
use std::time::Duration;

use redis::{AsyncCommands, RedisResult};
use sqlx::PgPool;
use tokio::time::sleep;

use crate::{config::Config, error::WorkerError, processor};

pub const GROUP: &str = "cloudcut-workers";
pub const EXPORT_STREAM: &str = "cloudcut:exports";
pub const ASSET_STREAM: &str = "cloudcut:assets";
const BLOCK_MS: usize = 5_000; // block for 5s on empty stream

pub struct ConsumerContext {
    pub redis: redis::Client,
    pub db: PgPool,
    pub config: Arc<Config>,
    pub s3: aws_sdk_s3::Client,
    pub consumer_name: String,
}

pub async fn run(ctx: Arc<ConsumerContext>) {
    // Ensure consumer groups exist (idempotent)
    if let Err(e) = ensure_groups(&ctx).await {
        tracing::error!("failed to create consumer groups: {e}");
    }

    tracing::info!(consumer = %ctx.consumer_name, "consumer loop started");

    loop {
        let result = tokio::select! {
            r = read_and_process(Arc::clone(&ctx)) => r,
        };

        if let Err(e) = result {
            tracing::error!("consumer iteration error: {e}");
            sleep(Duration::from_secs(2)).await; // back-off on errors
        }
    }
}

async fn ensure_groups(ctx: &ConsumerContext) -> Result<(), WorkerError> {
    let mut conn = ctx.redis.get_multiplexed_async_connection().await?;

    for stream in [EXPORT_STREAM, ASSET_STREAM] {
        let result: RedisResult<String> = conn
            .xgroup_create_mkstream(stream, GROUP, "$")
            .await;
        match result {
            Ok(_) => tracing::info!(stream, "consumer group created"),
            Err(e) if e.to_string().contains("BUSYGROUP") => {
                tracing::debug!(stream, "consumer group already exists");
            }
            Err(e) => return Err(WorkerError::Redis(e)),
        }
    }
    Ok(())
}

async fn read_and_process(ctx: Arc<ConsumerContext>) -> Result<(), WorkerError> {
    let mut conn = ctx.redis.get_multiplexed_async_connection().await?;

    // Read up to 10 messages from both streams in one call
    let reply: redis::Value = redis::cmd("XREADGROUP")
        .arg("GROUP").arg(GROUP).arg(&ctx.consumer_name)
        .arg("COUNT").arg(10)
        .arg("BLOCK").arg(BLOCK_MS)
        .arg("STREAMS")
        .arg(EXPORT_STREAM).arg(ASSET_STREAM)
        .arg(">").arg(">")
        .query_async(&mut conn)
        .await?;

    let messages = parse_xreadgroup_reply(reply);

    for (stream, msg_id, fields) in messages {
        let ctx2 = Arc::clone(&ctx);
        let stream2 = stream.clone();
        let msg_id2 = msg_id.clone();

        tokio::spawn(async move {
            if let Err(e) = processor::dispatch(&stream2, &fields, &ctx2.db, &ctx2.config, &ctx2.s3).await {
                tracing::error!(stream=%stream2, msg_id=%msg_id2, error=%e, "job failed");
                let _ = maybe_dead_letter(&ctx2, &stream2, &msg_id2, &e).await;
            } else {
                let mut conn2 = ctx2.redis.get_multiplexed_async_connection().await.unwrap();
                let _: RedisResult<i64> = conn2.xack(&stream2, GROUP, &[&msg_id2]).await;
                tracing::debug!(stream=%stream2, msg_id=%msg_id2, "job acked");
            }
        });
    }

    Ok(())
}

async fn maybe_dead_letter(
    ctx: &ConsumerContext,
    stream: &str,
    msg_id: &str,
    err: &WorkerError,
) -> Result<(), WorkerError> {
    let mut conn = ctx.redis.get_multiplexed_async_connection().await?;

    let pending: redis::Value = redis::cmd("XPENDING")
        .arg(stream).arg(GROUP).arg(msg_id).arg(msg_id).arg(1)
        .query_async(&mut conn)
        .await
        .unwrap_or(redis::Value::Nil);

    let delivery_count = extract_delivery_count(&pending).unwrap_or(0);

    if delivery_count >= ctx.config.max_retries as usize {
        tracing::error!(
            stream, msg_id, deliveries=delivery_count, error=%err,
            "max retries exceeded — dead-lettering message"
        );
        let dlq = format!("{stream}:dlq");
        let kv: Vec<(&str, String)> = vec![
            ("original_stream", stream.to_owned()),
            ("original_id", msg_id.to_owned()),
            ("error", err.to_string()),
        ];
        let _: RedisResult<String> = conn.xadd(&dlq, "*", &kv).await;
        let _: RedisResult<i64> = conn.xack(stream, GROUP, &[msg_id]).await;
    }

    Ok(())
}

fn parse_xreadgroup_reply(reply: redis::Value) -> Vec<(String, String, processor::JobFields)> {
    let mut out = Vec::new();

    let streams = match reply {
        redis::Value::Array(v) => v,
        _ => return out,
    };

    for stream_entry in streams {
        let stream_pair = match stream_entry {
            redis::Value::Array(v) => v,
            _ => continue,
        };
        if stream_pair.len() < 2 { continue; }

        let stream_name = match &stream_pair[0] {
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
            _ => continue,
        };

        let messages = match &stream_pair[1] {
            redis::Value::Array(v) => v,
            _ => continue,
        };

        for msg in messages {
            let msg_parts = match msg {
                redis::Value::Array(v) => v,
                _ => continue,
            };
            if msg_parts.len() < 2 { continue; }

            let msg_id = match &msg_parts[0] {
                redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
                _ => continue,
            };

            let field_list = match &msg_parts[1] {
                redis::Value::Array(v) => v,
                _ => continue,
            };

            let mut fields = std::collections::HashMap::new();
            for kv in field_list.chunks(2) {
                if kv.len() < 2 { continue; }
                let k = match &kv[0] {
                    redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
                    _ => continue,
                };
                let v = match &kv[1] {
                    redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
                    _ => continue,
                };
                fields.insert(k, v);
            }

            out.push((stream_name.clone(), msg_id, fields));
        }
    }

    out
}

fn extract_delivery_count(val: &redis::Value) -> Option<usize> {
    if let redis::Value::Array(outer) = val {
        if let Some(redis::Value::Array(inner)) = outer.first() {
            if let Some(redis::Value::Int(count)) = inner.get(3) {
                return Some(*count as usize);
            }
        }
    }
    None
}
