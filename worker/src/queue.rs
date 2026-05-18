#![allow(dead_code)] // Phase 4 wires the real XREADGROUP loop.
//! Redis Streams consumer.
//!
//! Stream layout (matches the producer in `backend::jobs`):
//!   stream  : `cloudcut:jobs`
//!   group   : `cloudcut-workers`
//!   consumer: `worker-{hostname}-{pid}`
//!
//! Phase 4 will:
//!   1. `XGROUP CREATE cloudcut:jobs cloudcut-workers $ MKSTREAM` on startup
//!   2. Loop `XREADGROUP GROUP cloudcut-workers <consumer> COUNT n BLOCK 5000 STREAMS cloudcut:jobs >`
//!   3. Dispatch each message to `processor::dispatch`
//!   4. On success: `XACK`; on failure: increment attempt counter and re-enqueue
//!      with exponential backoff per §3.9 (1 s → 4 s → 16 s → dead-letter).

use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};

use crate::error::WorkerResult;

pub const STREAM_KEY:    &str = "cloudcut:jobs";
pub const CONSUMER_GROUP: &str = "cloudcut-workers";

/// One job pulled off the stream.  `id` is the Redis stream entry id so we
/// can `XACK` after a successful run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedJob {
    pub id:              String,
    pub payload_json:    String,
    pub attempts:        u32,
    pub idempotency_key: String,
}

#[derive(Clone)]
pub struct Consumer {
    redis:    ConnectionManager,
    consumer: String,
}

impl Consumer {
    pub fn new(redis: ConnectionManager, consumer_name: impl Into<String>) -> Self {
        Self { redis, consumer: consumer_name.into() }
    }

    /// Ensure the consumer group exists.  Idempotent.
    pub async fn ensure_group(&self) -> WorkerResult<()> {
        // TODO: XGROUP CREATE cloudcut:jobs cloudcut-workers $ MKSTREAM
        Ok(())
    }

    /// Block-read up to `count` jobs from the stream.
    pub async fn read_batch(&self, _count: usize) -> WorkerResult<Vec<QueuedJob>> {
        // TODO: XREADGROUP GROUP cloudcut-workers <consumer> COUNT count BLOCK 5000 STREAMS cloudcut:jobs >
        Ok(Vec::new())
    }

    /// Mark a job as completed.
    pub async fn ack(&self, _job_id: &str) -> WorkerResult<()> {
        // TODO: XACK cloudcut:jobs cloudcut-workers <job_id>
        Ok(())
    }

    /// Re-queue with backoff or move to dead-letter when attempts exhausted.
    pub async fn requeue_or_dead_letter(&self, job: &QueuedJob) -> WorkerResult<()> {
        let _ = job;
        // TODO: write to cloudcut:jobs:dead_letter when attempts >= 3
        Ok(())
    }
}
