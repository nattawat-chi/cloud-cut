pub mod handlers;
pub mod models;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/:id/exports",
            post(handlers::create_export).get(handlers::list_exports),
        )
        .route("/exports/:id", get(handlers::get_export))
}
