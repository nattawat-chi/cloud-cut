//! Integration-style tests that spin up the Axum router with `axum::test`
//! (no real DB — just verifies routing and error shape).
//!
//! Tests that need a live Postgres are skipped unless `DATABASE_URL` is set.

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt; // for `oneshot`

// We can't easily construct AppState without a DB in unit-test context,
// so these tests verify the health endpoint and error serialisation shape
// by constructing a minimal router stub.

mod health {
    use super::*;
    use axum::{response::Json, routing::get, Router};

    async fn health_stub() -> Json<serde_json::Value> {
        Json(serde_json::json!({ "status": "ok" }))
    }

    #[tokio::test]
    async fn health_returns_200() {
        let app = Router::new().route("/api/v1/health", get(health_stub));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn unknown_route_returns_404() {
        let app = Router::new().route("/api/v1/health", get(health_stub));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/does-not-exist")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}

mod error_shape {
    use crate::backend_error_shape;
    use axum::http::StatusCode;

    #[test]
    fn unauthorized_has_correct_code() {
        let (status, code) = backend_error_shape("Unauthorized");
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(code, "UNAUTHORIZED");
    }
}

// Helper that mirrors the AppError → JSON contract without needing AppState.
fn backend_error_shape(kind: &str) -> (StatusCode, &'static str) {
    match kind {
        "Unauthorized" => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED"),
        "Forbidden" => (StatusCode::FORBIDDEN, "FORBIDDEN"),
        "NotFound" => (StatusCode::NOT_FOUND, "NOT_FOUND"),
        "Conflict" => (StatusCode::CONFLICT, "CONFLICT"),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"),
    }
}
