use std::path::Path;

use aws_credential_types::Credentials;
use aws_sdk_s3::config::{
    BehaviorVersion, Region, RequestChecksumCalculation, ResponseChecksumValidation,
};
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
        // MinIO compatibility: AWS SDK Rust 1.x defaults to sending
        // `x-amz-checksum-*` headers + STREAMING-AWS4-HMAC-SHA256-PAYLOAD on
        // every PUT (the "flexible checksums" feature). MinIO releases prior
        // to RELEASE.2024-10 reject those requests with an opaque 4xx that
        // the SDK surfaces only as "service error". Switching to WhenRequired
        // skips the extra checksums so put_object goes through cleanly.
        .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
        .response_checksum_validation(ResponseChecksumValidation::WhenRequired)
        .build();
    aws_sdk_s3::Client::from_conf(s3_config)
}

/// Stringify an SDK error including the full source chain — without this the
/// caller just sees `"service error"` because that's all SdkError's Display
/// outputs. We need the chain (response status, code, message) to diagnose
/// MinIO rejections like SignatureDoesNotMatch / InvalidAccessKeyId / etc.
fn fmt_sdk_err<E: std::error::Error + 'static>(prefix: &str, err: &E) -> String {
    let mut msg = format!("{prefix}: {err}");
    let mut src: Option<&(dyn std::error::Error + 'static)> = err.source();
    while let Some(s) = src {
        msg.push_str(" | caused by: ");
        msg.push_str(&s.to_string());
        src = s.source();
    }
    msg
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
        .map_err(|e| WorkerError::S3(fmt_sdk_err(&format!("put_object {key}"), &e)))?;

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
        .map_err(|e| WorkerError::S3(fmt_sdk_err(&format!("get_object {key}"), &e)))?;

    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|e| WorkerError::S3(fmt_sdk_err(&format!("read body {key}"), &e)))?
        .into_bytes();

    tokio::fs::write(dest, &bytes)
        .await
        .map_err(WorkerError::Io)?;

    tracing::debug!(key, bytes = bytes.len(), "downloaded from S3");
    Ok(())
}
