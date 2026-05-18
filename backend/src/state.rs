use std::sync::Arc;
use sqlx::PgPool;
use crate::{config::Config, rate_limit::RateLimiter};

#[derive(Clone)]
pub struct AppState {
    pub db:           PgPool,
    pub config:       Arc<Config>,
    pub rate_limiter: RateLimiter,
}
