use axum::{extract::State, Form, Json};
use serde::Deserialize;

use crate::{
    auth::extractor::AuthUser,
    error::AppError,
    pusher::client::AuthResponse,
    state::AppState,
};

/// pusher-js `authEndpoint` posts an `application/x-www-form-urlencoded` body:
///   `socket_id=<id>&channel_name=presence-project-<uuid>`
#[derive(Debug, Deserialize)]
pub struct ChannelAuthForm {
    pub socket_id: String,
    pub channel_name: String,
}

/// POST /api/v1/pusher/auth
///
/// Signs presence + private channel subscriptions. Public channels never hit
/// this endpoint — pusher-js auth-flows it automatically.
pub async fn channel_auth(
    State(state): State<AppState>,
    auth: AuthUser,
    Form(form): Form<ChannelAuthForm>,
) -> Result<Json<AuthResponse>, AppError> {
    let pusher = state
        .pusher
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("pusher not configured".into()))?;

    if form.channel_name.starts_with("presence-") {
        // Pull display info so other members can render an avatar / name
        let row: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT display_name, avatar_url FROM users WHERE id = $1",
        )
        .bind(auth.user_id)
        .fetch_optional(&state.db)
        .await?;
        let (display_name, avatar_url) =
            row.unwrap_or_else(|| ("Anonymous".to_owned(), None));

        let user_data = serde_json::json!({
            "user_id": auth.user_id.to_string(),
            "user_info": {
                "name": display_name,
                "email": auth.email,
                "avatar_url": avatar_url,
            }
        });
        Ok(Json(pusher.sign_presence(
            &form.socket_id,
            &form.channel_name,
            &user_data,
        )?))
    } else if form.channel_name.starts_with("private-") {
        Ok(Json(pusher.sign_private(&form.socket_id, &form.channel_name)))
    } else {
        Err(AppError::BadRequest(
            "channel must start with presence- or private-".into(),
        ))
    }
}
