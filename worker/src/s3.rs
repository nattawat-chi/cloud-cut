use std::path::Path;

use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use aws_sdk_s3::primitives::ByteStream;

use crate::{config::Config, error::WorkerError};

pub fn build_client(config: &Config) -> aws_sdk_s3::Client {
    let credentials = Credentials::new(
        &config.s3_access_key,
        &config.s3_secret_key,
        None,
        None,
        "cloudcut-worker",
    );
    let s3_config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .endpoint_url(&config.s3_endpoint)
        .credentials_provider(credentials)
        .region(Region::new(config.s3_region.clone()))
        .force_path_style(true)
        .build();
    aws_sdk_s3::Client::from_conf(s3_config)
}

/// Upload a local file to S3/MinIO and return the object key.
pub async fn upload_file(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
    content_type: &str,
) -> Result<(), WorkerError> {
    let body = ByteStream::from_path(local_path)
        .await
        .map_err(|e| WorkerError::S3(format!("read file for upload: {e}")))?;

    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .content_type(content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| WorkerError::S3(format!("put_object {key}: {e}")))?;

    tracing::debug!(key, "uploaded to S3");
    Ok(())
}

/// Download an S3 object to a local temp file path.
pub async fn download_file(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    dest: &Path,
) -> Result<(), WorkerError> {
    let resp = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|e| WorkerError::S3(format!("get_object {key}: {e}")))?;

    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|e| WorkerError::S3(format!("read body {key}: {e}")))?
        .into_bytes();

    tokio::fs::write(dest, &bytes)
        .await
        .map_err(WorkerError::Io)?;

    tracing::debug!(key, bytes = bytes.len(), "downloaded from S3");
    Ok(())
}
