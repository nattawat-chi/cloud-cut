use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — user UUID as string.
    pub sub: String,
    pub exp: u64,
    pub iat: u64,
}
