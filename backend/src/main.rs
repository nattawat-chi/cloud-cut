//! CloudCut backend — Phase 0 placeholder.
//!
//! Real router, auth, and DB pool land in Phase 3. This binary only proves that
//! `cargo run -p backend` succeeds (Rule 2) and that env wiring is reachable.

use std::net::SocketAddr;

use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // .env is optional — production reads real env vars directly.
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend=info,tower_http=info".into()),
        )
        .init();

    let host = std::env::var("BACKEND_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    info!("CloudCut backend — Phase 0 placeholder");
    info!("Would bind to {addr} (Phase 3 will start the Axum router here).");
    info!(
        "DATABASE_URL set: {}",
        std::env::var("DATABASE_URL").is_ok()
    );
    info!("REDIS_URL set:    {}", std::env::var("REDIS_URL").is_ok());

    Ok(())
}
