#![allow(dead_code)] // Pipelines call into these helpers in Phase 4.
//! Thin wrappers around the `ffmpeg` and `ffprobe` CLIs.
//!
//! Every helper:
//!   - spawns the CLI with `tokio::process::Command`
//!   - captures stdout / stderr
//!   - returns [`WorkerError::Ffmpeg`] when the process exits non-zero
//!
//! All commands match §3.5 / §3.8 of the spec verbatim.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::{WorkerError, WorkerResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub duration_ms:    i64,
    pub width:          i32,
    pub height:         i32,
    pub codec:          String,
    pub audio_codec:    Option<String>,
    pub file_size_bytes: i64,
}

async fn run(cmd: &mut Command, ctx: &str) -> WorkerResult<Vec<u8>> {
    let out = cmd.output().await?;
    if !out.status.success() {
        return Err(WorkerError::Ffmpeg {
            code:   out.status.code().unwrap_or(-1),
            stderr: format!("{ctx}: {}", String::from_utf8_lossy(&out.stderr)),
        });
    }
    Ok(out.stdout)
}

/// `ffprobe -v quiet -print_format json -show_format -show_streams INPUT`
pub async fn probe(input: &Path) -> WorkerResult<VideoMetadata> {
    let _ = input;
    // TODO: parse ffprobe JSON into VideoMetadata.
    Ok(VideoMetadata {
        duration_ms: 0, width: 0, height: 0,
        codec: String::new(), audio_codec: None, file_size_bytes: 0,
    })
}

/// Generate 720p proxy: `-vf scale=-2:720 -c:v libx264 -preset fast -crf 28`
pub async fn generate_proxy(input: &Path, output: &Path) -> WorkerResult<()> {
    run(
        Command::new("ffmpeg")
            .args(["-y", "-i"]).arg(input)
            .args(["-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "fast", "-crf", "28"])
            .args(["-c:a", "aac", "-b:a", "128k"])
            .arg(output),
        "generate_proxy",
    )
    .await
    .map(|_| ())
}

/// Generate thumbnail strip: `-vf "fps=1/5,scale=160:-1" thumb_%03d.jpg`
pub async fn generate_thumbnails(input: &Path, output_pattern: &Path) -> WorkerResult<()> {
    run(
        Command::new("ffmpeg")
            .args(["-y", "-i"]).arg(input)
            .args(["-vf", "fps=1/5,scale=160:-1", "-q:v", "5"])
            .arg(output_pattern),
        "generate_thumbnails",
    )
    .await
    .map(|_| ())
}

/// Extract raw audio for waveform peaks computation.
pub async fn extract_waveform(input: &Path, output_raw: &Path) -> WorkerResult<()> {
    run(
        Command::new("ffmpeg")
            .args(["-y", "-i"]).arg(input)
            .args(["-ac", "1", "-filter:a", "aformat=sample_fmts=s16", "-f", "s16le"])
            .arg(output_raw),
        "extract_waveform",
    )
    .await
    .map(|_| ())
}

/// Trim a segment: `-ss START -to END -c:v libx264 -c:a aac`
pub async fn trim(input: &Path, output: &Path, start_ms: i64, end_ms: i64) -> WorkerResult<()> {
    let ss = format_ms(start_ms);
    let to = format_ms(end_ms);
    run(
        Command::new("ffmpeg")
            .args(["-y", "-i"]).arg(input)
            .args(["-ss", &ss, "-to", &to, "-c:v", "libx264", "-c:a", "aac"])
            .arg(output),
        "trim",
    )
    .await
    .map(|_| ())
}

/// Concat a list of segments via `-f concat -safe 0 -i LIST`.
pub async fn concat(list_file: &Path, output: &Path) -> WorkerResult<()> {
    run(
        Command::new("ffmpeg")
            .args(["-y", "-f", "concat", "-safe", "0", "-i"]).arg(list_file)
            .args(["-c:v", "libx264", "-c:a", "aac"])
            .arg(output),
        "concat",
    )
    .await
    .map(|_| ())
}

fn format_ms(ms: i64) -> String {
    let total_secs  = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let frac = ms % 1000;
    format!("{h:02}:{m:02}:{s:02}.{frac:03}")
}

#[cfg(test)]
mod tests {
    use super::format_ms;

    #[test]
    fn formats_milliseconds_as_hms() {
        assert_eq!(format_ms(0),       "00:00:00.000");
        assert_eq!(format_ms(1_500),   "00:00:01.500");
        assert_eq!(format_ms(3_725_010), "01:02:05.010");
    }
}
