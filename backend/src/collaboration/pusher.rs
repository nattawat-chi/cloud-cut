#![allow(dead_code)] // Phase 5 scaffold — nothing calls it yet.
//! Pusher Channels HTTP client — Phase 5 stub.
//!
//! The real implementation will:
//! - POST to `https://api-{cluster}.pusher.com/apps/{app_id}/events`
//! - sign the body with HMAC-SHA256(app_secret, md5(body))
//! - retry on 5xx with exponential backoff
//!
//! Channel naming conventions (§4.2):
//! - `presence-project-{projectId}` — cursors & active editing
//! - `private-project-{projectId}`  — operation broadcasts
//! - `private-user-{userId}`        — job progress, asset-ready, export-completed

use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Clone, Debug)]
pub struct PusherClient {
    pub app_id:  String,
    pub key:     String,
    pub secret:  String,
    pub cluster: String,
}

impl PusherClient {
    pub fn from_env() -> Self {
        Self {
            app_id:  std::env::var("PUSHER_APP_ID").unwrap_or_default(),
            key:     std::env::var("PUSHER_KEY").unwrap_or_default(),
            secret:  std::env::var("PUSHER_SECRET").unwrap_or_default(),
            cluster: std::env::var("PUSHER_CLUSTER").unwrap_or_else(|_| "mt1".into()),
        }
    }

    /// Trigger an event on a channel.  Stub — Phase 5 wires the real HTTP call.
    pub async fn trigger<T: Serialize>(
        &self,
        _channel: &str,
        _event:   &str,
        _payload: &T,
    ) -> Result<(), AppError> {
        // TODO: reqwest POST + HMAC-SHA256 auth signature.
        Ok(())
    }

    // ── Channel name helpers ──────────────────────────────────────────────────

    pub fn project_channel(project_id: Uuid) -> String {
        format!("private-project-{project_id}")
    }

    pub fn user_channel(user_id: Uuid) -> String {
        format!("private-user-{user_id}")
    }

    pub fn presence_channel(project_id: Uuid) -> String {
        format!("presence-project-{project_id}")
    }
}
