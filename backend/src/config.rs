use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    // Database
    pub database_url: String,
    pub redis_url: String,

    // JWT
    pub jwt_secret: String,
    /// Access token lifetime in seconds (default 900 = 15 min)
    pub jwt_access_exp_secs: u64,
    /// Refresh token lifetime in seconds (default 604800 = 7 days)
    pub jwt_refresh_exp_secs: u64,

    // S3 / MinIO
    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_bucket: String,
    pub s3_region: String,
    /// Presigned PUT URL TTL in seconds (default 900)
    pub s3_presign_expires_secs: u64,

    // HTTP server
    pub backend_host: String,
    pub backend_port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: require("DATABASE_URL")?,
            redis_url: require("REDIS_URL")?,

            jwt_secret: require("JWT_SECRET")?,
            jwt_access_exp_secs: optional_parse("JWT_ACCESS_EXP_SECS", 900)?,
            jwt_refresh_exp_secs: optional_parse("JWT_REFRESH_EXP_SECS", 604_800)?,

            s3_endpoint: optional("S3_ENDPOINT", "http://localhost:9000"),
            s3_access_key: optional("S3_ACCESS_KEY", "cloudcut"),
            s3_secret_key: optional("S3_SECRET_KEY", "cloudcut_dev_secret"),
            s3_bucket: optional("S3_BUCKET", "cloudcut-assets"),
            s3_region: optional("S3_REGION", "us-east-1"),
            s3_presign_expires_secs: optional_parse("S3_PRESIGN_EXPIRES_SECS", 900)?,

            backend_host: optional("BACKEND_HOST", "0.0.0.0"),
            backend_port: optional_parse("BACKEND_PORT", 8080)?,
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
        Ok(v) => v
            .parse::<T>()
            .map_err(|e| anyhow::anyhow!("invalid {key}={v}: {e}")),
        Err(_) => Ok(default),
    }
}
