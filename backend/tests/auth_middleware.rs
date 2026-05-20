//! Integration tests — JWT authentication middleware behaviour.
//!
//! Builds a minimal Axum router that replicates the `AuthUser` extractor
//! contract (Bearer token → JWT decode → 401 on failure) without a live
//! database, and verifies every failure path mandated by the spec.

use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tower::ServiceExt;

// ── JWT helpers ────────────────────────────────────────────────────────────────

const SECRET: &str = "test_jwt_secret_exactly_32_bytes!";
const ALT_SECRET: &str = "wrong_secret_also_exactly_32_byts";

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    jti: String,
    exp: usize,
    iat: usize,
}

fn unix_now() -> usize {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
}

fn make_token_with_exp(exp: usize) -> String {
    let claims = Claims {
        sub: "00000000-0000-0000-0000-000000000001".into(),
        email: "alice@cloudcut.dev".into(),
        jti: "test-jti-001".into(),
        exp,
        iat: unix_now(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(SECRET.as_bytes()),
    )
    .unwrap()
}

fn valid_token() -> String {
    make_token_with_exp(unix_now() + 900)
}

fn expired_token() -> String {
    // Expired 1 hour ago — well outside any leeway window.
    make_token_with_exp(unix_now() - 3_600)
}

fn wrong_secret_token() -> String {
    let claims = Claims {
        sub: "attacker".into(),
        email: "evil@attacker.dev".into(),
        jti: "bad-jti".into(),
        exp: unix_now() + 900,
        iat: unix_now(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(ALT_SECRET.as_bytes()),
    )
    .unwrap()
}

// ── Middleware that mirrors the production `AuthUser` extractor ────────────────

async fn jwt_guard(req: Request<Body>, next: Next) -> Response {
    let bearer = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));

    let token = match bearer {
        Some(t) => t.to_owned(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                "missing or invalid Authorization header",
            )
                .into_response()
        }
    };

    match decode::<Claims>(
        &token,
        &DecodingKey::from_secret(SECRET.as_bytes()),
        &Validation::default(),
    ) {
        Ok(_) => next.run(req).await,
        Err(_) => (StatusCode::UNAUTHORIZED, "invalid or expired token").into_response(),
    }
}

fn protected_app() -> Router {
    Router::new()
        .route("/me", get(|| async { StatusCode::OK }))
        .layer(middleware::from_fn(jwt_guard))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn missing_auth_header_returns_401() {
    let res = protected_app()
        .oneshot(Request::builder().uri("/me").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn non_bearer_scheme_returns_401() {
    let res = protected_app()
        .oneshot(
            Request::builder()
                .uri("/me")
                .header(header::AUTHORIZATION, "Basic dXNlcjpwYXNz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn malformed_token_returns_401() {
    let res = protected_app()
        .oneshot(
            Request::builder()
                .uri("/me")
                .header(header::AUTHORIZATION, "Bearer not.a.real.jwt")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn token_signed_with_wrong_secret_returns_401() {
    let res = protected_app()
        .oneshot(
            Request::builder()
                .uri("/me")
                .header(
                    header::AUTHORIZATION,
                    format!("Bearer {}", wrong_secret_token()),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn expired_token_returns_401() {
    let res = protected_app()
        .oneshot(
            Request::builder()
                .uri("/me")
                .header(header::AUTHORIZATION, format!("Bearer {}", expired_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn valid_token_returns_200() {
    let res = protected_app()
        .oneshot(
            Request::builder()
                .uri("/me")
                .header(header::AUTHORIZATION, format!("Bearer {}", valid_token()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
}
