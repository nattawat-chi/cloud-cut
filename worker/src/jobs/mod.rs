pub mod export;
pub mod process_asset;

use std::collections::HashMap;

use crate::error::WorkerError;

/// A parsed Redis Stream message — just the field→value map.
pub type JobFields = HashMap<String, String>;

pub fn get_field<'a>(fields: &'a JobFields, key: &str) -> Result<&'a str, WorkerError> {
    fields
        .get(key)
        .map(|s| s.as_str())
        .ok_or_else(|| WorkerError::MissingField(key.to_owned()))
}
