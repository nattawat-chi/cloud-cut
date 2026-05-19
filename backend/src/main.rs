//! CloudCut backend — Axum HTTP server.
//!
//! Start: `cargo run -p backend`
//! Env:   copy `.env.example` to `.env` and fill in secrets.

mod app;
mod assets;
mod auth;
mod collaboration;
mod config;
mod db;
mod error;
mod exports;
mod openapi;
mod projects;
mod pusher;
mod rate_limit;
mod state;
mod storage;
mod timeline;
mod users;
mod workspaces;

use std::net::SocketAddr;

use tracing::info;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use config::Config;
use openapi::ApiDoc;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend=debug,tower_http=info,sqlx=warn".into()),
        )
        .init();

    let config = Config::from_env()?;
    let addr: SocketAddr = format!("{}:{}", config.backend_host, config.backend_port).parse()?;

    info!("connecting to database…");
    let state = AppState::new(config).await?;
    info!("database connected ✓");

    let router = app::build_router(state);

    info!("CloudCut backend listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}

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
        .nest("/auth", auth::router())
        .merge(workspaces::router())
        .merge(projects::router())
        .merge(timeline::router())
        .merge(assets::router())
        .merge(exports::router())
        .merge(pusher::router())
        .merge(collaboration::router());

    Router::new()
        .nest("/api/v1", api)
        // Swagger UI at /api/v1/docs — raw spec at /api/v1/openapi.json
        .merge(
            SwaggerUi::new("/api/v1/docs")
                .url("/api/v1/openapi.json", ApiDoc::openapi()),
        )
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
