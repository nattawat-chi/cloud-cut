pub mod handlers;
pub mod models;

use axum::{routing::get, Router};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/projects/:id/operations",
        get(handlers::list_operations),
    )
}
