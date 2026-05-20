//! Minimal Pusher client — implements channel-auth signing + REST API event triggering.
//!
//! We hand-roll this rather than pull `pusher = "0.5"` because:
//!   * That crate uses sync reqwest + a 2020-era API surface
//!   * The Pusher signing protocol is short and well-documented
//!   * Hand-rolling lets the worker share the same HMAC helpers via a shared crate later

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use md5::{Digest as Md5Digest, Md5};
use serde::Serialize;
use sha2::Sha256;

use crate::config::Config;
use crate::error::AppError;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct PusherClient {
    app_id: String,
    key: String,
    secret: String,
    cluster: String,
    http: reqwest::Client,
}

impl PusherClient {
    /// Returns `None` when Pusher is not configured — keeps dev environments runnable.
    pub fn from_config(config: &Config) -> Option<Arc<Self>> {
        let app_id = config.pusher_app_id.clone()?;
        let key = config.pusher_key.clone()?;
        let secret = config.pusher_secret.clone()?;
        let cluster = config
            .pusher_cluster
            .clone()
            .unwrap_or_else(|| "mt1".to_owned());
        Some(Arc::new(Self {
            app_id,
            key,
            secret,
            cluster,
            http: reqwest::Client::new(),
        }))
    }

    pub fn key(&self) -> &str {
        &self.key
    }

    // ─── Channel auth (called by POST /pusher/auth) ───────────────────────────

    /// Sign a presence-channel subscription.
    pub fn sign_presence(
        &self,
        socket_id: &str,
        channel: &str,
        user_data: &serde_json::Value,
    ) -> Result<AuthResponse, AppError> {
        let channel_data = serde_json::to_string(user_data)
            .map_err(|e| AppError::internal(format!("user_data serialize: {e}")))?;
        let string_to_sign = format!("{socket_id}:{channel}:{channel_data}");
        let signature = self.hmac_hex(&string_to_sign);
        Ok(AuthResponse {
            auth: format!("{}:{}", self.key, signature),
            channel_data: Some(channel_data),
        })
    }

    /// Sign a private-channel subscription.
    pub fn sign_private(&self, socket_id: &str, channel: &str) -> AuthResponse {
        let string_to_sign = format!("{socket_id}:{channel}");
        let signature = self.hmac_hex(&string_to_sign);
        AuthResponse {
            auth: format!("{}:{}", self.key, signature),
            channel_data: None,
        }
    }

    // ─── REST trigger ────────────────────────────────────────────────────────

    /// Fire-and-forget event publish. Logs and swallows errors so a Pusher
    /// outage doesn't break the API mutation that triggered it.
    pub async fn trigger(&self, channel: &str, event: &str, data: serde_json::Value) {
        if let Err(e) = self.trigger_inner(channel, event, data).await {
            tracing::warn!(channel, event, error = %e, "pusher trigger failed");
        }
    }

    async fn trigger_inner(
        &self,
        channel: &str,
        event: &str,
        data: serde_json::Value,
    ) -> Result<(), AppError> {
        let data_str = data.to_string();
        let body = serde_json::json!({
            "name": event,
            "channel": channel,
            "data": data_str,
        })
        .to_string();

        let path = format!("/apps/{}/events", self.app_id);
        let body_md5 = hex::encode(Md5::digest(body.as_bytes()));
        let auth_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let query = format!(
            "auth_key={}&auth_timestamp={}&auth_version=1.0&body_md5={}",
            self.key, auth_timestamp, body_md5
        );
        let string_to_sign = format!("POST\n{path}\n{query}");
        let signature = self.hmac_hex(&string_to_sign);

        let base_url = format!("https://api-{}.pusher.com{path}", self.cluster);
        let url = format!("{base_url}?{query}&auth_signature={signature}");

        // Log only non-sensitive metadata — never log the signed URL or signature.
        tracing::debug!(channel, event, body_len = body.len(), "pusher trigger");

        let resp = self
            .http
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body.clone())
            .send()
            .await
            .map_err(|e| AppError::internal(format!("pusher http: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            // Do NOT log `body` here — it contains the full event payload.
            tracing::warn!(
                channel,
                event,
                %status,
                response = %text,
                "pusher REST rejected request"
            );
            return Err(AppError::internal(format!("pusher {status}: {text}")));
        }

        tracing::debug!(channel, event, "pusher trigger ok");
        Ok(())
    }

    fn hmac_hex(&self, msg: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(msg.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub auth: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_data: Option<String>,
}
