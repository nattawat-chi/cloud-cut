#![allow(dead_code)] // Variants reserved for Phase 4 call sites.
//! Worker-wide error type.

#[derive(thiserror::Error, Debug)]
pub enum WorkerError {
    #[error("queue error: {0}")]
    Queue(String),

    #[error("ffmpeg failed (exit {code}): {stderr}")]
    Ffmpeg { code: i32, stderr: String },

    #[error("storage error: {0}")]
    Storage(String),

    #[error("database error")]
    Database(#[from] sqlx::Error),

    #[error("redis error")]
    Redis(#[from] redis::RedisError),

    #[error("io error")]
    Io(#[from] std::io::Error),

    #[error("serialisation error")]
    Serde(#[from] serde_json::Error),

    #[error("internal")]
    Internal(#[from] anyhow::Error),
}

pub type WorkerResult<T> = Result<T, WorkerError>;
