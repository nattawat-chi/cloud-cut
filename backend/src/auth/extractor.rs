use async_trait::async_trait;
use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use uuid::Uuid;

use crate::{auth::jwt::decode_access_token, error::AppError, state::AppState};

/// Authenticated user identity extracted from `Authorization: Bearer <token>`.
/// Use this as a handler argument to require authentication.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub email: String,
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(parts)?;
        let claims = decode_access_token(&token, &state.config.jwt_secret)?;
        let user_id = claims
            .sub
            .parse::<Uuid>()
            .map_err(|_| AppError::Unauthorized)?;
        Ok(AuthUser {
            user_id,
            email: claims.email,
        })
    }
}

fn extract_bearer(parts: &Parts) -> Result<String, AppError> {
    let header = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    header
        .strip_prefix("Bearer ")
        .map(|t| t.to_owned())
        .ok_or(AppError::Unauthorized)
}
