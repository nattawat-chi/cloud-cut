pub mod dto;
pub mod handlers;
pub mod models;
pub mod operation_log;
pub mod presence;
pub mod pusher;
pub mod sync;

use axum::{routing::{get, post}, Router};
use uuid::Uuid;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/:id/operations", get(handlers::list_operations))
        .route("/pusher/auth", post(sync::channel_auth))
}

/// Broadcast a project-scoped event on `private-project-{project_id}`.
///
/// Fire-and-forget — Pusher errors are logged but never bubble up to the
/// caller so a transient Pusher outage cannot break a timeline mutation.
pub async fn publish_project_event(
    state: &AppState,
    project_id: Uuid,
    event: &str,
    data: serde_json::Value,
) {
    if let Some(pusher) = &state.pusher {
        let channel = format!("presence-project-{project_id}");
        pusher.trigger(&channel, event, data).await;
    }
}
