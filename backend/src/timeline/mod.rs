pub mod handlers;
pub mod models;

use axum::{
    routing::{get, patch, post},
    Router,
};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Bulk timeline snapshot (single request for full editor load)
        .route("/projects/:id/timeline", get(handlers::get_timeline))
        // Tracks
        .route(
            "/projects/:id/tracks",
            get(handlers::list_tracks).post(handlers::create_track),
        )
        .route(
            "/tracks/:id",
            patch(handlers::update_track).delete(handlers::delete_track),
        )
        // Clips
        .route("/tracks/:id/clips", post(handlers::add_clip))
        .route(
            "/clips/:id",
            patch(handlers::update_clip).delete(handlers::delete_clip),
        )
        .route("/clips/:id/split", post(handlers::split_clip))
        // Effects
        .route("/clips/:id/effects", post(handlers::add_effect))
        .route(
            "/effects/:id",
            patch(handlers::update_effect).delete(handlers::delete_effect),
        )
}
