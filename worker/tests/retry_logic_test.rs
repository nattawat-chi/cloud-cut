//! Retry / backoff / dead-letter coverage (§3.9).

#[tokio::test]
#[ignore = "requires redis"]
async fn requeues_with_exponential_backoff_then_dead_letters() {
    // TODO Phase 4:
    //   - inject a deterministic always-fail processor
    //   - assert attempt 1 → next_run_at ≈ now
    //   - assert attempt 2 → +1s, attempt 3 → +4s, attempt 4 → +16s
    //   - assert 5th failure moves the entry to cloudcut:jobs:dead_letter
}
