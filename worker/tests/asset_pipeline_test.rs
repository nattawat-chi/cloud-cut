//! Integration tests for the asset processing pipeline.

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn asset_pipeline_processes_video() {
        // TODO: spin up a test DB + MinIO, enqueue an asset job, assert variants are created
        // Requires docker-compose test profile (Phase 8).
    }

    #[tokio::test]
    async fn asset_pipeline_processes_audio() {
        // TODO: verify waveform.json variant is produced for audio assets.
    }

    #[tokio::test]
    async fn asset_pipeline_marks_asset_ready_on_success() {
        // TODO: assert status transitions uploading → ready.
    }

    #[tokio::test]
    async fn asset_pipeline_marks_asset_error_on_bad_file() {
        // TODO: corrupt file → status transitions to error.
    }
}
