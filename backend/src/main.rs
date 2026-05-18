mod app;
mod auth;
mod openapi;
mod assets;
mod collaboration;
mod config;
mod db;
mod error;
mod exports;
mod models;
mod projects;
mod rate_limit;
mod state;
mod timeline;
mod workspaces;

use std::{net::SocketAddr, sync::Arc};
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend=debug,tower_http=info".into()),
        )
        .init();

    let config = config::Config::from_env()?;

    let pool = db::connect(&config.database_url).await?;
    info!("connected to postgres");

    let redis_client = redis::Client::open(config.redis_url.as_str())
        .map_err(|e| anyhow::anyhow!("redis client: {e}"))?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client)
        .await
        .map_err(|e| anyhow::anyhow!("redis connect: {e}"))?;
    info!("connected to redis");

    let state = state::AppState {
        db:           pool,
        config:       Arc::new(config.clone()),
        rate_limiter: rate_limit::RateLimiter::new(redis_conn),
    };

    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let router = app::build(state);

    info!("CloudCut backend listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;

    Ok(())
}
