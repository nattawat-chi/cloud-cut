pub mod dto;
pub mod operation_log;
pub mod presence;
pub mod pusher;
pub mod sync;

use axum::{routing::post, Router};
use uuid::Uuid;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/pusher/auth", post(sync::channel_auth))
}

// ─── Channel naming convention ────────────────────────────────────────────────
//
// `presence-project-<uuid>` — one channel per project. Members appear/disappear
// as collaborators open/close the editor. Op events are broadcast here.

pub fn project_channel(project_id: Uuid) -> String {
    format!("presence-project-{project_id}")
}

/// Fire-and-forget publish to a project's presence channel.
pub async fn publish_project_event(
    state: &AppState,
    project_id: Uuid,
    event: &str,
    data: serde_json::Value,
) {
    if let Some(p) = &state.pusher {
        let channel = project_channel(project_id);
        p.trigger(&channel, event, data).await;
    }
}
