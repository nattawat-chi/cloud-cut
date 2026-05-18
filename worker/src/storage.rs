#![allow(dead_code)] // Pipelines download inputs / upload outputs via this.
//! Streaming object-storage client for the worker.
//!
//! Unlike `backend::storage` (which only generates presigned URLs), the worker
//! needs to actually read large video files into a temp dir and push outputs
//! back up.  Phase 4 will swap the stub for an `aws-sdk-s3` (or `s3`) client.

use std::path::Path;

use crate::error::{WorkerError, WorkerResult};

#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub endpoint:    String,
    pub region:      String,
    pub bucket:      String,
    pub access_key:  String,
    pub secret_key:  String,
}

impl StorageConfig {
    pub fn from_env() -> Self {
        Self {
            endpoint:   std::env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".into()),
            region:     std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".into()),
            bucket:     std::env::var("S3_BUCKET").unwrap_or_else(|_| "cloudcut".into()),
            access_key: std::env::var("S3_ACCESS_KEY").unwrap_or_default(),
            secret_key: std::env::var("S3_SECRET_KEY").unwrap_or_default(),
        }
    }
}

#[derive(Clone)]
pub struct StorageClient {
    pub config: StorageConfig,
}

impl StorageClient {
    pub fn new(config: StorageConfig) -> Self {
        Self { config }
    }

    /// Download `key` to a local path, streaming to disk to avoid loading the
    /// whole file into memory (videos can be hundreds of MB).
    pub async fn download_to(&self, _key: &str, _dest: &Path) -> WorkerResult<()> {
        Err(WorkerError::Storage("download not implemented (Phase 4)".into()))
    }

    /// Upload a local file to `key`, streaming from disk.
    pub async fn upload_from(&self, _key: &str, _src: &Path, _content_type: &str) -> WorkerResult<()> {
        Err(WorkerError::Storage("upload not implemented (Phase 4)".into()))
    }

    pub async fn delete(&self, _key: &str) -> WorkerResult<()> {
        Ok(())
    }
}
