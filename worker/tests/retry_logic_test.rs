//! Tests for Redis Streams retry and dead-letter behaviour.

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn job_is_retried_up_to_max_retries() {
        // TODO: inject a always-failing job handler, assert message is
        // re-delivered max_retries times before being dead-lettered.
    }

    #[tokio::test]
    async fn job_is_dead_lettered_after_max_retries() {
        // TODO: assert message appears in `cloudcut:exports:dlq` after
        // exceeding the configured max_retries threshold.
    }

    #[tokio::test]
    async fn successful_job_is_acked_and_not_redelivered() {
        // TODO: assert XPENDING count drops to 0 after a successful dispatch.
    }
}
