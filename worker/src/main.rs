//! CloudCut worker — Redis Streams consumer + ffmpeg pipelines.
//!
//! Start: `cargo run -p worker`
//! Env:   copy `.env.example` to `.env`

mod config;
mod consumer;
mod error;
mod ffmpeg;
mod jobs;
mod s3;

use std::sync::Arc;

use sqlx::PgPool;
use tracing::info;

use config::Config;
use consumer::ConsumerContext;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "worker=debug,sqlx=warn".into()),
        )
        .init();

    let config = Config::from_env()?;

    // Verify ffmpeg is available (Rule #6)
    verify_ffmpeg();

    info!("connecting to database…");
    let db = PgPool::connect(&config.database_url).await?;
    info!("database connected ✓");

    let redis = redis::Client::open(config.redis_url.as_str())?;
    let s3 = s3::build_client(&config);

    let consumer_name = format!(
        "worker-{}",
        hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".into())
    );

    let ctx = Arc::new(ConsumerContext {
        redis,
        db,
        config: Arc::new(config),
        s3,
        consumer_name: consumer_name.clone(),
    });

    info!(consumer = %consumer_name, "CloudCut worker started");

    // Run the consumer loop — blocks forever
    consumer::run(ctx).await;

    Ok(())
}

fn verify_ffmpeg() {
    match std::process::Command::new("ffmpeg").arg("-version").output() {
        Ok(out) if out.status.success() => {
            let ver = String::from_utf8_lossy(&out.stdout);
            let first = ver.lines().next().unwrap_or("unknown");
            info!("ffmpeg ✓  {first}");
        }
        Ok(_) => tracing::warn!("ffmpeg returned non-zero status"),
        Err(e) => tracing::warn!("ffmpeg not found on PATH: {e} — pipelines will fail"),
    }
}
