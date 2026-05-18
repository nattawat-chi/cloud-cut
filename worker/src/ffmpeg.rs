use std::future::Future;
use std::path::Path;
use std::process::Stdio;

use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::error::WorkerError;

// ─── Probe ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ProbeResult {
    pub duration_ms: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    #[allow(dead_code)] // used by future transcode-strategy selector
    pub has_video: bool,
    pub has_audio: bool,
    pub size_bytes: i64,
}

/// Run `ffprobe` to extract metadata from a local file.
pub async fn probe(path: &Path) -> Result<ProbeResult, WorkerError> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| WorkerError::Ffmpeg(format!("ffprobe launch: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WorkerError::Ffmpeg(format!("ffprobe failed: {stderr}")));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| WorkerError::Ffmpeg(format!("ffprobe json parse: {e}")))?;

    let streams = json["streams"].as_array();
    let has_video = streams
        .map(|s| s.iter().any(|st| st["codec_type"].as_str() == Some("video")))
        .unwrap_or(false);
    let has_audio = streams
        .map(|s| s.iter().any(|st| st["codec_type"].as_str() == Some("audio")))
        .unwrap_or(false);

    // First video stream dims
    let (width, height) = streams
        .and_then(|s| s.iter().find(|st| st["codec_type"].as_str() == Some("video")))
        .map(|st| {
            (
                st["width"].as_i64().map(|v| v as i32),
                st["height"].as_i64().map(|v| v as i32),
            )
        })
        .unwrap_or((None, None));

    let duration_ms = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|secs| (secs * 1000.0) as i64);

    let size_bytes = json["format"]["size"]
        .as_str()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| {
            std::fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0)
        });

    Ok(ProbeResult { duration_ms, width, height, has_video, has_audio, size_bytes })
}

// ─── Proxy ────────────────────────────────────────────────────────────────────

/// Transcode to 720p H.264/AAC MP4 proxy for fast timeline preview.
/// `on_progress` is called with a 0..=100 integer roughly every 500ms while
/// ffmpeg streams `-progress` updates. Pass a no-op closure when not needed.
pub async fn make_proxy<F, Fut>(
    input: &Path,
    output: &Path,
    duration_ms: Option<i64>,
    on_progress: F,
) -> Result<(), WorkerError>
where
    F: Fn(i16) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send,
{
    let args = vec![
        "-y".to_owned(),
        "-i".to_owned(),
        input.to_string_lossy().into_owned(),
        "-vf".to_owned(),
        "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease".to_owned(),
        "-c:v".to_owned(),
        "libx264".to_owned(),
        "-preset".to_owned(),
        "fast".to_owned(),
        "-crf".to_owned(),
        "23".to_owned(),
        "-movflags".to_owned(),
        "+faststart".to_owned(),
        "-c:a".to_owned(),
        "aac".to_owned(),
        "-b:a".to_owned(),
        "128k".to_owned(),
        "-ac".to_owned(),
        "2".to_owned(),
        // Progress stream → stdout, machine-parseable key=value
        "-progress".to_owned(),
        "pipe:1".to_owned(),
        "-nostats".to_owned(),
        output.to_string_lossy().into_owned(),
    ];
    run_ffmpeg_with_progress(&args, duration_ms, on_progress).await
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

/// Extract a single JPEG frame at `offset_secs` seconds.
pub async fn make_thumbnail(
    input: &Path,
    output: &Path,
    offset_secs: f64,
) -> Result<(), WorkerError> {
    run_ffmpeg(&[
        "-y",
        "-ss", &offset_secs.to_string(),
        "-i", input.to_str().unwrap(),
        "-vframes", "1",
        "-vf", "scale='min(640,iw)':-2",
        "-q:v", "4",
        output.to_str().unwrap(),
    ])
    .await
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

/// Extract audio samples and write a compact waveform JSON:
/// `{ "channels": 1, "sample_rate": 8000, "samples_per_pixel": 256, "bits": 8, "data": [...] }`
///
/// Uses ffmpeg to resample to mono 8 kHz raw PCM, then we compute
/// RMS amplitudes per 256-sample window in Rust (no audiowaveform dependency).
pub async fn make_waveform(input: &Path, output: &Path) -> Result<(), WorkerError> {
    let raw_tmp = output.with_extension("raw");

    // Extract raw mono 8 kHz signed 16-bit PCM
    run_ffmpeg(&[
        "-y",
        "-i", input.to_str().unwrap(),
        "-ac", "1",
        "-ar", "8000",
        "-f", "s16le",
        raw_tmp.to_str().unwrap(),
    ])
    .await?;

    // Read raw PCM and compute per-window amplitude
    let raw = tokio::fs::read(&raw_tmp).await.map_err(WorkerError::Io)?;
    let _ = tokio::fs::remove_file(&raw_tmp).await; // best-effort cleanup

    const SAMPLES_PER_PIXEL: usize = 256;
    let samples: Vec<i16> = raw
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect();

    let data: Vec<u8> = samples
        .chunks(SAMPLES_PER_PIXEL)
        .map(|chunk| {
            let rms = (chunk.iter().map(|&s| (s as f64).powi(2)).sum::<f64>()
                / chunk.len() as f64)
                .sqrt();
            // Normalise to 0-255 (i16 max = 32767)
            ((rms / 32767.0) * 255.0).min(255.0) as u8
        })
        .collect();

    let waveform = serde_json::json!({
        "channels": 1,
        "sample_rate": 8000,
        "samples_per_pixel": SAMPLES_PER_PIXEL,
        "bits": 8,
        "data": data,
    });

    tokio::fs::write(output, serde_json::to_vec(&waveform).unwrap())
        .await
        .map_err(WorkerError::Io)?;

    Ok(())
}

// ─── Export ───────────────────────────────────────────────────────────────────

pub struct ExportSpec<'a> {
    pub clips: &'a [ClipSpec<'a>],
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub format: &'a str,
    pub output: &'a Path,
}

pub struct ClipSpec<'a> {
    pub local_path: &'a Path,
    #[allow(dead_code)] // used by future overlap/gap-fill timeline renderer
    pub pos_ms: i64,
    pub dur_ms: i64,
    pub trim_in_ms: i64,
    pub speed: f64,
    pub filters: &'a str, // CSS-style filter string already converted to ffmpeg
}

/// Build and run an ffmpeg filter-graph that composites timeline clips
/// into a single output file.
pub async fn export_timeline(spec: &ExportSpec<'_>) -> Result<(), WorkerError> {
    if spec.clips.is_empty() {
        return Err(WorkerError::Other("no clips to export".into()));
    }

    // Build a concat filter: one segment per clip with trim + setpts
    let mut inputs: Vec<String> = Vec::new();
    let mut filter_parts: Vec<String> = Vec::new();

    for (i, clip) in spec.clips.iter().enumerate() {
        let trim_start = clip.trim_in_ms as f64 / 1000.0;
        let trim_end = trim_start + (clip.dur_ms as f64 / 1000.0 / clip.speed);

        inputs.push(format!(
            "-ss {:.3} -i {}",
            trim_start,
            clip.local_path.display()
        ));

        let mut vf = format!(
            "[{i}:v]trim={:.3}:{:.3},setpts=(PTS-STARTPTS)/{:.4},fps={fps}",
            trim_start,
            trim_end,
            clip.speed,
            fps = spec.fps,
        );
        if !clip.filters.is_empty() {
            vf.push(',');
            vf.push_str(clip.filters);
        }
        vf.push_str(&format!(
            ",scale={}:{},setsar=1[v{i}];",
            spec.width, spec.height
        ));

        let af = format!(
            "[{i}:a]atrim={:.3}:{:.3},asetpts=PTS-STARTPTS,atempo={:.4}[a{i}];",
            trim_start, trim_end, clip.speed,
        );

        filter_parts.push(vf);
        filter_parts.push(af);
    }

    let n = spec.clips.len();
    let v_labels: String = (0..n).map(|i| format!("[v{i}]")).collect::<Vec<_>>().join("");
    let a_labels: String = (0..n).map(|i| format!("[a{i}]")).collect::<Vec<_>>().join("");
    filter_parts.push(format!("{v_labels}concat=n={n}:v=1:a=0[vout];"));
    filter_parts.push(format!("{a_labels}concat=n={n}:v=0:a=1[aout]"));

    let filter_complex = filter_parts.join("");

    let (codec_v, codec_a) = match spec.format {
        "webm" => ("libvpx-vp9", "libopus"),
        _ => ("libx264", "aac"),
    };

    let mut args: Vec<String> = Vec::new();
    for part in inputs {
        for token in part.split_whitespace() {
            args.push(token.to_owned());
        }
    }
    args.extend([
        "-filter_complex".into(), filter_complex,
        "-map".into(), "[vout]".into(),
        "-map".into(), "[aout]".into(),
        "-c:v".into(), codec_v.into(),
        "-preset".into(), "medium".into(),
        "-crf".into(), "20".into(),
        "-c:a".into(), codec_a.into(),
        "-b:a".into(), "192k".into(),
        "-movflags".into(), "+faststart".into(),
        "-y".into(),
        spec.output.to_str().unwrap().to_owned(),
    ]);

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_ffmpeg(&arg_refs).await
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async fn run_ffmpeg(args: &[&str]) -> Result<(), WorkerError> {
    tracing::debug!(args = ?args, "running ffmpeg");

    let output = Command::new("ffmpeg")
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| WorkerError::Ffmpeg(format!("ffmpeg launch: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Capture last 500 chars of stderr (ffmpeg is verbose)
        let tail: String = stderr.chars().rev().take(500).collect::<String>()
            .chars().rev().collect();
        return Err(WorkerError::Ffmpeg(format!("exit {:?}: …{tail}", output.status.code())));
    }

    Ok(())
}

/// Run ffmpeg with `-progress pipe:1` parsing. Streams stdout line-by-line,
/// extracts `out_time_us=N` values, computes a 0–100 percent against
/// `duration_ms`, and invokes `on_progress` after each "block" (ffmpeg emits
/// one block ~every 500ms ending with `progress=continue` or `progress=end`).
async fn run_ffmpeg_with_progress<F, Fut>(
    args: &[String],
    duration_ms: Option<i64>,
    on_progress: F,
) -> Result<(), WorkerError>
where
    F: Fn(i16) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send,
{
    tracing::debug!(args = ?args, "running ffmpeg (progress)");

    let mut child = Command::new("ffmpeg")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| WorkerError::Ffmpeg(format!("ffmpeg spawn: {e}")))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| WorkerError::Ffmpeg("missing stdout pipe".into()))?;
    let total_us = duration_ms.map(|d| d * 1000).unwrap_or(0);

    // Parse progress lines until EOF
    let mut reader = BufReader::new(stdout).lines();
    let mut last_emit: i16 = 0;
    while let Some(line) = reader
        .next_line()
        .await
        .map_err(|e| WorkerError::Ffmpeg(format!("read progress: {e}")))?
    {
        // ffmpeg progress format: `key=value`. We only care about `out_time_us`
        // and the `progress=` sentinel that terminates each block.
        if let Some(value) = line.strip_prefix("out_time_us=") {
            if total_us > 0 {
                if let Ok(out_us) = value.trim().parse::<i64>() {
                    let pct = ((out_us as f64 / total_us as f64) * 100.0)
                        .clamp(0.0, 99.0) as i16;
                    if pct > last_emit {
                        last_emit = pct;
                        on_progress(pct).await;
                    }
                }
            }
        } else if line.starts_with("progress=end") {
            on_progress(100).await;
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| WorkerError::Ffmpeg(format!("ffmpeg wait: {e}")))?;
    if !status.success() {
        // Drain stderr for diagnostics
        let mut stderr_buf = String::new();
        if let Some(mut s) = child.stderr.take() {
            let _ = tokio::io::AsyncReadExt::read_to_string(&mut s, &mut stderr_buf).await;
        }
        let tail: String = stderr_buf.chars().rev().take(500).collect::<String>()
            .chars().rev().collect();
        return Err(WorkerError::Ffmpeg(format!(
            "exit {:?}: …{tail}",
            status.code()
        )));
    }

    Ok(())
}
