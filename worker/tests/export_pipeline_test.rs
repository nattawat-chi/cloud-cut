//! Integration test for the export render pipeline (§3.6 / §3.7).

#[tokio::test]
#[ignore = "requires postgres + redis + ffmpeg + storage"]
async fn renders_two_clip_timeline_into_concatenated_mp4() {
    // TODO Phase 4:
    //   1. seed project with two clips on the main video track
    //   2. enqueue RenderExport
    //   3. assert export_jobs.status transitions queued → processing → done
    //   4. assert output_key is set and the file exists in MinIO
    //   5. assert progress_pct advanced past 0 at least once
}
