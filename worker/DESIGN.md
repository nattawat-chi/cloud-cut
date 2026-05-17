# Worker — Design notes

> Placeholder for Phase 4. The brief (section 3.13) requires answering:
>
> 1. Why Redis Streams vs. Apalis vs. Postgres job table?
> 2. Retry + dead-letter mechanics
> 3. Idempotency strategy (prevent duplicate processing)
> 4. Pros / cons of shelling out to ffmpeg CLI
> 5. Memory + temp-file handling for 30-minute videos
> 6. Cancellation flow for export jobs
> 7. Horizontal worker scaling
> 8. Cost estimate for a 5-minute 1080p export
