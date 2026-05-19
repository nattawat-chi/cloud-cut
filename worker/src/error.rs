use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)] // Http variant + is_retryable() consumed by Phase 5 HTTP callbacks
pub enum WorkerError {
    #[error("ffmpeg error: {0}")]
    Ffmpeg(String),

    #[error("s3 upload error: {0}")]
    S3(String),

    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("http callback error: {0}")]
    Http(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("job data missing field: {0}")]
    MissingField(String),

    #[error("{0}")]
    Other(String),
}

impl WorkerError {
    /// True if this error is worth retrying (transient), false if it's permanent.
    #[allow(dead_code)]
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            WorkerError::Redis(_) | WorkerError::Http(_) | WorkerError::S3(_)
        )
    }
}
