//! CloudCut backend — Axum HTTP server.
//!
//! Start: `cargo run -p backend`
//! Env:   copy `.env.example` to `.env` and fill in secrets.

mod app;
mod assets;
mod auth;
mod collaboration;
mod config;
mod db;
mod error;
mod exports;
mod openapi;
mod projects;
mod rate_limit;
mod state;
mod storage;
mod timeline;
mod users;
mod workspaces;

use std::net::SocketAddr;

use tracing::info;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend=debug,tower_http=info,sqlx=warn".into()),
        )
        .init();

    let config = Config::from_env()?;
    let addr: SocketAddr = format!("{}:{}", config.backend_host, config.backend_port).parse()?;

    info!("connecting to database…");
    let state = AppState::new(config).await?;
    info!("database connected ✓");

    let router = app::build_router(state);

    info!("CloudCut backend listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
