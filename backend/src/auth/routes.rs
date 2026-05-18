use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::State, http::StatusCode, Json};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::{claims::Claims, extractor::AuthUser},
    error::AppError,
    state::AppState,
};

// ─── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Validate, ToSchema)]
pub struct RegisterBody {
    /// Must be a valid email address.
    #[validate(email)]
    pub email: String,
    /// Minimum 8 characters.
    #[validate(length(min = 8))]
    #[schema(min_length = 8)]
    pub password: String,
    #[validate(length(min = 1, max = 100))]
    pub display_name: String,
}

#[derive(Deserialize, ToSchema)]
pub struct LoginBody {
    pub email:    String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct AuthResponse {
    pub access_token: String,
    pub token_type:   String,
    pub user:         UserPayload,
}

#[derive(Serialize, ToSchema)]
pub struct UserPayload {
    pub id:           Uuid,
    pub email:        String,
    pub display_name: String,
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

pub fn issue_token(user_id: Uuid, config: &crate::config::Config) -> Result<String, AppError> {
    let now = jsonwebtoken::get_current_timestamp();
    let claims = Claims {
        sub: user_id.to_string(),
        iat: now,
        exp: now + config.jwt_expiry_secs,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("jwt sign: {e}")))
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    request_body = RegisterBody,
    responses(
        (status = 201, description = "Registration successful", body = AuthResponse),
        (status = 422, description = "Validation error — email already taken or password too short"),
    ),
    tag = "auth"
)]
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    body.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(body.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hash: {e}")))?
        .to_string();

    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(&body.email)
    .bind(&hash)
    .bind(&body.display_name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.constraint() == Some("users_email_key") => {
            AppError::Validation("email already registered".into())
        }
        _ => AppError::Database(e),
    })?;

    let token = issue_token(user_id, &state.config)?;
    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            access_token: token,
            token_type:   "Bearer".into(),
            user: UserPayload {
                id:           user_id,
                email:        body.email,
                display_name: body.display_name,
            },
        }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    request_body = LoginBody,
    responses(
        (status = 200, description = "Login successful", body = AuthResponse),
        (status = 401, description = "Invalid credentials"),
    ),
    tag = "auth"
)]
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> Result<Json<AuthResponse>, AppError> {
    let row: Option<(Uuid, String, String, String)> = sqlx::query_as(
        "SELECT id, email, display_name, password_hash FROM users WHERE email = $1",
    )
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await?;

    let (user_id, email, display_name, hash) = row.ok_or(AppError::Unauthorized)?;

    let parsed =
        PasswordHash::new(&hash).map_err(|e| AppError::Internal(anyhow::anyhow!("{e}")))?;
    Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)?;

    let token = issue_token(user_id, &state.config)?;
    Ok(Json(AuthResponse {
        access_token: token,
        token_type:   "Bearer".into(),
        user: UserPayload { id: user_id, email, display_name },
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/me",
    responses(
        (status = 200, description = "Current authenticated user", body = UserPayload),
        (status = 401, description = "Missing or invalid Bearer token"),
    ),
    security(("bearer_auth" = [])),
    tag = "auth"
)]
pub async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<UserPayload>, AppError> {
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, email, display_name FROM users WHERE id = $1",
    )
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?;

    let (id, email, display_name) = row.ok_or_else(|| AppError::NotFound("user".into()))?;
    Ok(Json(UserPayload { id, email, display_name }))
}
