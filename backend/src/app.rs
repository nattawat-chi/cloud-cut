//! Application router — assembles all sub-routers into the top-level Axum app.

use std::time::Duration;

use axum::{
    http::{header, Method},
    response::Json,
    routing::get,
    Router,
};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .max_age(Duration::from_secs(3600));

    let api = Router::new()
        .route("/health", get(health))
        .nest("/auth", crate::auth::router())
        .merge(crate::workspaces::router())
        .merge(crate::projects::router())
        .merge(crate::timeline::router())
        .merge(crate::assets::router())
        .merge(crate::exports::router())
        .merge(crate::collaboration::router());

    Router::new()
        .nest("/api/v1", api)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
