//! Integration tests for the asset processing pipeline (§3.4).
//!
//! Marked `#[ignore]` because they require a live Postgres + Redis + a small
//! input video on disk.  `cargo test -p worker -- --ignored` runs them
//! against the docker-compose dev infra.

#[tokio::test]
#[ignore = "requires postgres + redis + ffmpeg"]
async fn extracts_metadata_then_enqueues_proxy_thumbnails_waveform() {
    // TODO Phase 4:
    //   1. insert assets(status='processing')
    //   2. enqueue ExtractMetadata
    //   3. assert assets row updated with width/height/duration_ms
    //   4. assert three follow-up jobs land on the stream
}
