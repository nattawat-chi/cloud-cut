#![allow(dead_code)] // Some helpers are wired by app.rs, others reserved for follow-ups.
//! Cross-cutting Tower middleware.
//!
//! Centralises layer construction so `app.rs` stays declarative.

use axum::http::HeaderName;
use tower_http::{
    cors::{Any, CorsLayer},
    request_id::{MakeRequestUuid, SetRequestIdLayer},
    trace::TraceLayer,
};

/// `x-request-id` header — generated per request, propagated to handlers and
/// emitted in every error response (see [`crate::error::AppError`]).
pub fn request_id_layer() -> SetRequestIdLayer<MakeRequestUuid> {
    SetRequestIdLayer::new(HeaderName::from_static("x-request-id"), MakeRequestUuid)
}

/// Permissive CORS — locked down by env-controlled allow-list in prod.
pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
}

/// Default `tower-http` HTTP tracing layer.
pub fn trace_layer()
-> TraceLayer<tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>> {
    TraceLayer::new_for_http()
}
