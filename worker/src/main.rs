//! CloudCut worker — Phase 0 placeholder.
//!
//! Real Redis Streams consumer + ffmpeg pipelines land in Phase 4. This binary
//! only proves that `cargo run -p worker` succeeds (Rule 3) and that ffmpeg is
//! reachable on PATH (worker container ships ffmpeg pre-installed).

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

    info!("CloudCut worker — Phase 0 placeholder");
    info!(
        "DATABASE_URL set: {}",
        std::env::var("DATABASE_URL").is_ok()
    );
    info!("REDIS_URL set:    {}", std::env::var("REDIS_URL").is_ok());

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

    Ok(())
}
