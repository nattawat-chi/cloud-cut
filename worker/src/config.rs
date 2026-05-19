use anyhow::{Context, Result};

#[derive(Debug, Clone)]
#[allow(dead_code)] // backend_url + tuning fields wired in Phase 5 (rate-limit + HTTP callbacks)
pub struct Config {
    pub redis_url: String,
    pub database_url: String,

    // S3 / MinIO
    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_bucket: String,
    pub s3_region: String,

    // Backend API base URL (for status callbacks)
    pub backend_url: String,

    // Worker tuning
    /// Number of concurrent job processors
    pub concurrency: usize,
    /// How many ms to sleep between empty-stream polls
    pub poll_interval_ms: u64,
    /// Max retries before a job is dead-lettered
    pub max_retries: u32,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            redis_url: require("REDIS_URL")?,
            database_url: require("DATABASE_URL")?,

            s3_endpoint: optional("S3_ENDPOINT", "http://localhost:9000"),
            s3_access_key: optional("S3_ACCESS_KEY", "cloudcut"),
            s3_secret_key: optional("S3_SECRET_KEY", "cloudcut_dev_secret"),
            s3_bucket: optional("S3_BUCKET", "cloudcut-assets"),
            s3_region: optional("S3_REGION", "us-east-1"),

            backend_url: optional("BACKEND_URL", "http://localhost:8080"),

            concurrency: optional_parse("WORKER_CONCURRENCY", 4)?,
            poll_interval_ms: optional_parse("WORKER_POLL_MS", 1000)?,
            max_retries: optional_parse("WORKER_MAX_RETRIES", 3)?,
        })
    }
}

fn require(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("missing required env var: {key}"))
}

fn optional(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn optional_parse<T: std::str::FromStr>(key: &str, default: T) -> Result<T>
where
    T::Err: std::fmt::Display,
{
    match std::env::var(key) {
        Ok(v) => v.parse::<T>().map_err(|e| anyhow::anyhow!("invalid {key}: {e}")),
        Err(_) => Ok(default),
    }
}
