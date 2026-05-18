//! CloudCut worker — Redis Streams consumer + ffmpeg pipelines.
//!
//! Layout follows spec §3.11 — each module is currently a scaffold; Phase 4
//! wires them into a live consumer loop.

mod asset_pipeline;
mod cleanup;
mod error;
mod export_pipeline;
mod ffmpeg;
mod processor;
mod progress;
mod queue;
mod storage;

use std::process::Command;
use tracing::{info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "worker=info".into()),
        )
        .init();

    info!("CloudCut worker — scaffold (Phase 4 wires the consumer loop)");
    info!(
        "DATABASE_URL set: {}",
        std::env::var("DATABASE_URL").is_ok()
    );
    info!("REDIS_URL set:    {}", std::env::var("REDIS_URL").is_ok());

    // Verify ffmpeg is on PATH — the worker container ships it pre-installed.
    match Command::new("ffmpeg").arg("-version").output() {
        Ok(out) if out.status.success() => {
            let first_line = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("(unknown)")
                .to_string();
            info!("ffmpeg available: {first_line}");
        }
        Ok(out) => warn!(
            "ffmpeg returned non-zero status: {}",
            String::from_utf8_lossy(&out.stderr)
        ),
        Err(e) => warn!("ffmpeg not on PATH (will be required in Phase 4): {e}"),
    }

    // ── Phase 4 will replace the rest of main() with: ──────────────────────────
    //   let pool   = connect_db().await?;
    //   let redis  = connect_redis().await?;
    //   let consumer = queue::Consumer::new(redis, hostname());
    //   consumer.ensure_group().await?;
    //   loop {
    //       for job in consumer.read_batch(8).await? {
    //           match processor::dispatch(&pool, &job).await {
    //               Ok(())  => consumer.ack(&job.id).await?,
    //               Err(e)  => { warn!(?e); consumer.requeue_or_dead_letter(&job).await?; }
    //           }
    //       }
    //   }
    Ok(())
}
