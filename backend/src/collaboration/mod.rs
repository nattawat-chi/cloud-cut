//! Real-time collaboration.  Structure follows §4.6 of the spec:
//!
//! ```text
//! collaboration/
//! ├── mod.rs           — module declarations + router
//! ├── dto.rs           — request / response payloads + broadcast schema
//! ├── sync.rs          — GET /projects/:id/operations  (offline reconnect §4.5)
//! ├── operation_log.rs — append / read the operation_logs table
//! ├── pusher.rs        — Pusher Channels HTTP client       (Phase 5)
//! └── presence.rs      — presence-channel auth             (Phase 5)
//! ```

pub mod dto;
pub mod operation_log;
pub mod presence;
pub mod pusher;
pub mod sync;

use axum::{routing::get, Router};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/projects/:id/operations", get(sync::list_operations))
}
