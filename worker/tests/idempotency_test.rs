//! Idempotency-key behaviour for at-least-once delivery.

#[tokio::test]
#[ignore = "requires postgres"]
async fn duplicate_job_with_same_idempotency_key_is_a_no_op() {
    // TODO Phase 4:
    //   1. enqueue GenerateProxy {idempotency_key: "k1"} — assert success + asset_variant inserted
    //   2. enqueue the same payload again — assert no second asset_variant row
    //   3. assert processing_jobs row reuses the existing run (no duplicate fan-out)
}
