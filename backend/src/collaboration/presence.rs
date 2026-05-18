#![allow(dead_code)] // Phase 5 scaffold — wired when /pusher/auth route lands.
//! Presence-channel authentication — Phase 5 stub.
//!
//! Pusher requires the server to sign presence-channel subscription requests
//! with HMAC-SHA256 over `"{socket_id}:{channel_name}:{channel_data_json}"`.
//! The signed payload is returned as `{auth, channel_data}` and the JS client
//! forwards it to Pusher.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use super::pusher::PusherClient;

#[derive(Deserialize)]
pub struct PresenceAuthRequest {
    pub socket_id:    String,
    pub channel_name: String,
}

#[derive(Serialize)]
pub struct PresenceAuthResponse {
    pub auth:         String,
    pub channel_data: String,
}

/// Authenticate a presence-channel subscription for `user_id`.
///
/// Phase 5 fills in the real HMAC signature; this stub returns placeholder
/// values so the route compiles and the React client can dev-iterate against
/// a mock Pusher.
pub async fn authenticate(
    _pusher:  &PusherClient,
    user_id:  Uuid,
    req:      &PresenceAuthRequest,
) -> Result<PresenceAuthResponse, AppError> {
    let channel_data = serde_json::json!({
        "user_id":   user_id,
        "user_info": {},
    })
    .to_string();

    Ok(PresenceAuthResponse {
        // TODO: HMAC-SHA256(secret, format!("{socket_id}:{channel}:{channel_data}"))
        auth: format!("stub:{}:{}", req.socket_id, req.channel_name),
        channel_data,
    })
}
