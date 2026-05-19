//! Integration tests for the export pipeline.

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn export_pipeline_produces_mp4() {
        // TODO: create a project with clips, trigger export, assert output.mp4 exists in S3.
    }

    #[tokio::test]
    async fn export_pipeline_marks_job_done() {
        // TODO: assert export_jobs.status transitions processing → done.
    }

    #[tokio::test]
    async fn export_pipeline_marks_job_error_on_empty_timeline() {
        // TODO: project with no clips → job transitions to error.
    }
}
