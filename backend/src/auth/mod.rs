pub mod claims;
pub mod extractor;
pub mod routes;

use axum::{routing::{get, post}, Router};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(routes::register))
        .route("/auth/login",    post(routes::login))
        .route("/auth/me",       get(routes::me))
}
