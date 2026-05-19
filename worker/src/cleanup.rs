//! Cleanup routines — purge stale temp files and expired DLQ entries.

use crate::error::WorkerError;

/// Remove temp files older than `max_age_secs` from the system temp directory.
#[allow(dead_code)]
pub async fn purge_old_temp_files(max_age_secs: u64) -> Result<usize, WorkerError> {
    let tmp = std::env::temp_dir();
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(max_age_secs))
        .unwrap_or(std::time::UNIX_EPOCH);

    let mut removed = 0usize;
    let mut entries = tokio::fs::read_dir(&tmp).await.map_err(WorkerError::Io)?;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(meta) = entry.metadata().await else { continue };
        if !meta.is_file() { continue; }
        let Ok(modified) = meta.modified() else { continue };
        if modified < cutoff {
            if tokio::fs::remove_file(entry.path()).await.is_ok() {
                removed += 1;
            }
        }
    }

    tracing::info!(removed, "cleaned up stale temp files");
    Ok(removed)
}
