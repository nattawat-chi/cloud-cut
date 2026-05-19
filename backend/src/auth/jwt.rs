use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// Subject = user UUID
    pub sub: String,
    pub email: String,
    /// JWT ID — random per token to prevent reuse if secret rotates
    pub jti: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn encode_access_token(
    user_id: Uuid,
    email: &str,
    secret: &str,
    exp_secs: u64,
) -> Result<String, AppError> {
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_owned(),
        jti: Uuid::new_v4().to_string(),
        exp: now + exp_secs as usize,
        iat: now,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::internal(format!("jwt encode: {e}")))
}

pub fn decode_access_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|td| td.claims)
    .map_err(|e| {
        tracing::debug!("jwt decode failed: {e}");
        AppError::Unauthorized
    })
}
