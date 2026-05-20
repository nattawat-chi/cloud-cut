//! Job processor — shared types and stream dispatcher.

use std::collections::HashMap;

use sqlx::PgPool;

use crate::{config::Config, error::WorkerError};

/// Parsed Redis Stream message — field→value map from one stream entry.
pub type JobFields = HashMap<String, String>;

pub fn get_field<'a>(fields: &'a JobFields, key: &str) -> Result<&'a str, WorkerError> {
    fields
        .get(key)
        .map(|s| s.as_str())
        .ok_or_else(|| WorkerError::MissingField(key.to_owned()))
}

/// Route an incoming stream message to the appropriate pipeline.
pub async fn dispatch(
    stream: &str,
    fields: &JobFields,
    db: &PgPool,
    config: &Config,
    s3: &aws_sdk_s3::Client,
    redis: &redis::Client,
) -> Result<(), WorkerError> {
    match stream {
        crate::queue::EXPORT_STREAM => {
            crate::export_pipeline::run(fields, db, config, s3, redis).await
        }
        crate::queue::ASSET_STREAM => {
            crate::asset_pipeline::run(fields, db, config, s3).await
        }
        other => Err(WorkerError::Other(format!("unknown stream: {other}"))),
    }
}
