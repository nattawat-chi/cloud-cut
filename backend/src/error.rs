use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation: {0}")]
    Validation(String),

    #[error("Database error")]
    Database(#[from] sqlx::Error),

    #[error("Rate limited: {0}")]
    RateLimited(String),

    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            AppError::Forbidden(_) => (StatusCode::FORBIDDEN, "Forbidden"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "NotFound"),
            AppError::Validation(_)   => (StatusCode::UNPROCESSABLE_ENTITY, "ValidationError"),
            AppError::RateLimited(_) => (StatusCode::TOO_MANY_REQUESTS,     "RateLimited"),
            AppError::Database(e) => {
                tracing::error!(err = %e, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "InternalServerError")
            }
            AppError::Internal(e) => {
                tracing::error!(err = %e, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "InternalServerError")
            }
        };

        let message = self.to_string();
        (
            status,
            Json(json!({
                "statusCode": status.as_u16(),
                "error": code,
                "message": message,
            })),
        )
            .into_response()
    }
}
