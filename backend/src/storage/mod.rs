#![allow(dead_code)] // Scaffold — assets/presigned-url will call into this.
//! S3-compatible object storage client.
//!
//! Used by `assets/presigned_url` to generate browser-direct upload URLs and
//! by the worker to read inputs / write outputs.  Backed by MinIO in dev,
//! R2 / S3 in prod (selected by env vars).
//!
//! Phase 4 will wire a real `aws-sdk-s3` or `s3` crate client.  This module
//! pins the public surface so callers can be written first.

use std::time::Duration;

use crate::error::AppError;

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

#[derive(Debug, Clone)]
pub struct PresignedUrl {
    pub url:        String,
    pub method:     &'static str,   // "PUT" | "GET"
    pub expires_in: Duration,
    pub key:        String,
}

#[derive(Clone)]
pub struct StorageClient {
    pub config: StorageConfig,
}

impl StorageClient {
    pub fn new(config: StorageConfig) -> Self {
        Self { config }
    }

    /// Pre-signed `PUT` URL for browser-direct upload.  Stub.
    pub async fn presigned_put(
        &self,
        key:          &str,
        _content_type: &str,
        ttl:          Duration,
    ) -> Result<PresignedUrl, AppError> {
        Ok(PresignedUrl {
            url:        format!("{}/{}/{}?stub-signature", self.config.endpoint, self.config.bucket, key),
            method:     "PUT",
            expires_in: ttl,
            key:        key.into(),
        })
    }

    /// Pre-signed `GET` URL for client download.  Stub.
    pub async fn presigned_get(&self, key: &str, ttl: Duration) -> Result<PresignedUrl, AppError> {
        Ok(PresignedUrl {
            url:        format!("{}/{}/{}?stub-signature", self.config.endpoint, self.config.bucket, key),
            method:     "GET",
            expires_in: ttl,
            key:        key.into(),
        })
    }

    /// Delete one object.  Stub.
    pub async fn delete(&self, _key: &str) -> Result<(), AppError> {
        Ok(())
    }
}
