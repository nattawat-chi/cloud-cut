use std::sync::Arc;

use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use sqlx::PgPool;

use crate::config::Config;

/// Shared application state injected into every Axum handler via `State<AppState>`.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: redis::Client,
    pub config: Arc<Config>,
    pub s3: aws_sdk_s3::Client,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let db = PgPool::connect(&config.database_url).await?;
        let redis = redis::Client::open(config.redis_url.as_str())?;
        let s3 = build_s3_client(&config);
        Ok(Self {
            db,
            redis,
            config: Arc::new(config),
            s3,
        })
    }
}

fn build_s3_client(config: &Config) -> aws_sdk_s3::Client {
    let credentials = Credentials::new(
        &config.s3_access_key,
        &config.s3_secret_key,
        None,
        None,
        "cloudcut",
    );
    let s3_config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .endpoint_url(&config.s3_endpoint)
        .credentials_provider(credentials)
        .region(Region::new(config.s3_region.clone()))
        // MinIO requires path-style addressing (bucket in path, not subdomain)
        .force_path_style(true)
        .build();
    aws_sdk_s3::Client::from_conf(s3_config)
}
