//! Tests to verify job processing is idempotent (safe to re-run on redelivery).

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn processing_same_asset_twice_is_safe() {
        // TODO: run asset_pipeline::run for the same asset_id twice,
        // assert ON CONFLICT upsert keeps only one variant row per kind.
    }

    #[tokio::test]
    async fn exporting_same_job_twice_is_safe() {
        // TODO: run export_pipeline::run for the same job_id twice,
        // assert the output S3 key is stable and job ends in 'done'.
    }
}
