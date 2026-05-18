#![allow(dead_code)] // Phase 4 wires call sites + DB transitions.
//! Asset processing pipeline (§3.4):
//!
//! ```text
//! confirm-upload  → create Asset(status = processing)
//!                 → enqueue ExtractMetadata
//!                 → worker extracts metadata
//!                 → enqueue in parallel:
//!                   ├── GenerateProxy
//!                   ├── GenerateThumbnails
//!                   └── ExtractWaveform
//!                 → create AssetVariant rows
//!                 → mark Asset(status = ready)
//!                 → broadcast asset-ready to private-user-{userId}
//! ```

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::WorkerResult;

pub async fn extract_metadata(_db: &PgPool, _asset_id: Uuid, _input_key: &str) -> WorkerResult<()> {
    // TODO: download asset → ffmpeg::probe → update assets table → enqueue siblings
    Ok(())
}

pub async fn generate_proxy(_db: &PgPool, _asset_id: Uuid, _input_key: &str) -> WorkerResult<()> {
    // TODO: download → ffmpeg::generate_proxy → upload → INSERT asset_variants (proxy)
    Ok(())
}

pub async fn generate_thumbnails(_db: &PgPool, _asset_id: Uuid, _input_key: &str) -> WorkerResult<()> {
    // TODO: download → ffmpeg::generate_thumbnails → stitch → upload → INSERT asset_variants (thumbnail)
    Ok(())
}

pub async fn extract_waveform(_db: &PgPool, _asset_id: Uuid, _input_key: &str) -> WorkerResult<()> {
    // TODO: download → ffmpeg::extract_waveform → peaks → upload → INSERT asset_variants (waveform)
    Ok(())
}
