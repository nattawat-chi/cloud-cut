use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use rand::RngCore;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::{
        extractor::AuthUser,
        jwt::encode_access_token,
        models::{
            AccessTokenResponse, LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest,
            TokenPairResponse, UserRow,
        },
    },
    error::AppError,
    state::AppState,
};

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "User created", body = TokenPairResponse),
        (status = 409, description = "Email already registered"),
        (status = 400, description = "Validation error"),
    ),
    tag = "auth",
)]
pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<TokenPairResponse>), AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Hash password with Argon2id
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| AppError::internal(format!("argon2: {e}")))?
        .to_string();

    let user_id = Uuid::new_v4();
    let row = sqlx::query_as::<_, UserRow>(
        r#"
        INSERT INTO users (id, email, password_hash, display_name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, password_hash, display_name, avatar_url, created_at
        "#,
    )
    .bind(user_id)
    .bind(&req.email)
    .bind(&hash)
    .bind(&req.display_name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match &e {
        // Check by Postgres SQLSTATE (23505 = unique_violation) instead of the
        // constraint name — Postgres auto-generates `users_email_key` from the
        // UNIQUE column but the exact name can drift on schema changes or
        // sqlx versions. SQLSTATE is the spec-defined contract.
        sqlx::Error::Database(dbe) if dbe.code().as_deref() == Some("23505") => {
            AppError::Conflict("email already registered".into())
        }
        _ => e.into(),
    })?;

    let (access_token, refresh_token) = issue_token_pair(&state, &row).await?;
    Ok((
        StatusCode::CREATED,
        Json(TokenPairResponse {
            expires_in: state.config.jwt_access_exp_secs,
            access_token,
            refresh_token,
            token_type: "Bearer",
            user: row.into(),
        }),
    ))
}

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Login successful", body = TokenPairResponse),
        (status = 401, description = "Invalid credentials"),
    ),
    tag = "auth",
)]
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<TokenPairResponse>, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let row = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, display_name, avatar_url, created_at
         FROM users WHERE email = $1",
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?; // don't leak whether email exists

    let parsed = PasswordHash::new(&row.password_hash)
        .map_err(|e| AppError::internal(format!("hash parse: {e}")))?;
    Argon2::default()
        .verify_password(req.password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)?;

    let (access_token, refresh_token) = issue_token_pair(&state, &row).await?;
    Ok(Json(TokenPairResponse {
        expires_in: state.config.jwt_access_exp_secs,
        access_token,
        refresh_token,
        token_type: "Bearer",
        user: row.into(),
    }))
}

// ─── POST /api/v1/auth/refresh ────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/v1/auth/refresh",
    request_body = RefreshRequest,
    responses(
        (status = 200, description = "New access token", body = AccessTokenResponse),
        (status = 401, description = "Refresh token invalid, revoked, or expired"),
    ),
    tag = "auth",
)]
pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<AccessTokenResponse>, AppError> {
    let hash = token_hash(&req.refresh_token);
    let now = Utc::now();

    let row = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT u.id, u.email, u.password_hash, u.display_name, u.avatar_url, u.created_at
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked_at IS NULL
          AND rt.expires_at > $2
        "#,
    )
    .bind(&hash)
    .bind(now)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let access_token = encode_access_token(
        row.id,
        &row.email,
        &state.config.jwt_secret,
        state.config.jwt_access_exp_secs,
    )?;

    Ok(Json(AccessTokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in: state.config.jwt_access_exp_secs,
    }))
}

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

pub async fn logout(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(req): Json<LogoutRequest>,
) -> Result<StatusCode, AppError> {
    let hash = token_hash(&req.refresh_token);
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL",
    )
    .bind(&hash)
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/auth/me",
    responses(
        (status = 200, description = "Current authenticated user"),
        (status = 401, description = "Missing or invalid Bearer token"),
    ),
    security(("bearer_auth" = [])),
    tag = "auth",
)]
pub async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, display_name, avatar_url, created_at
         FROM users WHERE id = $1",
    )
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "id": row.id,
        "email": row.email,
        "display_name": row.display_name,
        "avatar_url": row.avatar_url,
        "created_at": row.created_at,
    })))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Generate a 256-bit random refresh token (hex-encoded) and persist its SHA-256 hash.
async fn issue_token_pair(state: &AppState, row: &UserRow) -> Result<(String, String), AppError> {
    let access_token = encode_access_token(
        row.id,
        &row.email,
        &state.config.jwt_secret,
        state.config.jwt_access_exp_secs,
    )?;

    // 32 random bytes → 64-char hex string
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let refresh_token = hex::encode(bytes);
    let hash = token_hash(&refresh_token);

    let expires_at =
        Utc::now() + chrono::Duration::seconds(state.config.jwt_refresh_exp_secs as i64);

    sqlx::query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)")
        .bind(row.id)
        .bind(&hash)
        .bind(expires_at)
        .execute(&state.db)
        .await?;

    Ok((access_token, refresh_token))
}

fn token_hash(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    hex::encode(digest)
}
