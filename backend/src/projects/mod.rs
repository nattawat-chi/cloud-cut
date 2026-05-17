pub mod handlers;
pub mod models;

use axum::{
    routing::{delete, get, patch, post},
    Router,
};

use crate::state::AppState;

/// Routes mounted under `/api/v1`.
pub fn router() -> Router<AppState> {
    Router::new()
        // workspace-scoped project listing / creation
        .route(
            "/workspaces/:workspace_id/projects",
            get(handlers::list_projects).post(handlers::create_project),
        )
        // individual project operations
        .route(
            "/projects/:id",
            get(handlers::get_project)
                .patch(handlers::update_project)
                .delete(handlers::archive_project),
        )
}
