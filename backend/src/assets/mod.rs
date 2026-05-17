pub mod handlers;
pub mod models;

use axum::{
    routing::{get, patch, post},
    Router,
};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/workspaces/:workspace_id/assets",
            get(handlers::list_assets),
        )
        .route(
            "/workspaces/:workspace_id/assets/presign",
            post(handlers::presign_upload),
        )
        .route(
            "/assets/:id/status",
            patch(handlers::update_asset_status),
        )
}
