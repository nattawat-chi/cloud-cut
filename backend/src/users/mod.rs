#![allow(dead_code)] // Scaffold — routes wired in a follow-up phase.
//! User profile management.
//!
//! `auth/` owns the credentials + JWT lifecycle (register, login, me).
//! This module owns the *profile* surface:
//!
//! - GET    /users/:id      — public profile (display_name, avatar_url)
//! - PATCH  /users/me       — update own profile
//! - DELETE /users/me       — soft-delete own account (90-day retention)

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{auth::extractor::AuthUser, error::AppError, state::AppState};

#[derive(Serialize)]
pub struct PublicProfile {
    pub id:           Uuid,
    pub display_name: String,
    pub avatar_url:   Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateProfileBody {
    pub display_name: Option<String>,
    pub avatar_url:   Option<String>,
}

/// GET /users/:id  — public profile (any authenticated user)
pub async fn get_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> Result<Json<PublicProfile>, AppError> {
    let row: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT id, display_name, avatar_url FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (id, display_name, avatar_url) =
        row.ok_or_else(|| AppError::NotFound("user".into()))?;
    Ok(Json(PublicProfile { id, display_name, avatar_url }))
}

/// PATCH /users/me  — update caller's profile (stub)
pub async fn update_me(
    State(_state): State<AppState>,
    _auth: AuthUser,
    Json(_body): Json<UpdateProfileBody>,
) -> Result<StatusCode, AppError> {
    Ok(StatusCode::NOT_IMPLEMENTED)
}

/// DELETE /users/me  — soft-delete caller's account (stub)
pub async fn delete_me(
    State(_state): State<AppState>,
    _auth: AuthUser,
) -> Result<StatusCode, AppError> {
    Ok(StatusCode::NOT_IMPLEMENTED)
}

pub fn router() -> Router<AppState> {
    Router::new()
        // /users/me must be registered before /users/:id so the static segment
        // takes precedence over the dynamic parameter.
        .route("/users/me",  patch(update_me).delete(delete_me))
        .route("/users/:id", get(get_profile))
}
