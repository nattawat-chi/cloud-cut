//! Timeline mutations — tracks, clips, effects, transitions, text overlays.
//!
//! All routes mount under `/projects/:id/…` because the timeline is always
//! addressed relative to a project.  Authorization (editor+) is enforced by
//! each handler via [`crate::workspaces::authz::require_role`].
//!
//! Structure:
//! ```text
//! timeline/
//! ├── mod.rs           — router
//! ├── tracks.rs        — POST/PATCH/DELETE /projects/:id/tracks[/...]
//! ├── clips.rs         — clip CRUD + split + batch
//! ├── effects.rs       — clip-effect CRUD + reorder
//! ├── transitions.rs   — transition CRUD
//! └── text_overlays.rs — text-overlay CRUD
//! ```

pub mod clips;
pub mod effects;
pub mod text_overlays;
pub mod tracks;
pub mod transitions;

use axum::{
    routing::{patch, post},
    Router,
};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Tracks
        .route("/projects/:id/tracks",          post(tracks::create))
        .route("/projects/:id/tracks/:trackId", patch(tracks::update).delete(tracks::delete))
        // Clips — `/batch` must come before `:clipId` so it isn't shadowed.
        .route("/projects/:id/clips/batch",         post(clips::batch))
        .route("/projects/:id/clips",               post(clips::create))
        .route("/projects/:id/clips/:clipId",       patch(clips::update).delete(clips::delete))
        .route("/projects/:id/clips/:clipId/split", post(clips::split))
        // Effects — `/reorder` must come before `:effectId`.
        .route("/projects/:id/clips/:clipId/effects/reorder",   patch(effects::reorder))
        .route("/projects/:id/clips/:clipId/effects",           post(effects::create))
        .route("/projects/:id/clips/:clipId/effects/:effectId", patch(effects::update).delete(effects::delete))
        // Transitions
        .route("/projects/:id/transitions",                 post(transitions::create))
        .route("/projects/:id/transitions/:transitionId",   patch(transitions::update).delete(transitions::delete))
        // Text overlays
        .route("/projects/:id/text-overlays",              post(text_overlays::create))
        .route("/projects/:id/text-overlays/:overlayId",   patch(text_overlays::update).delete(text_overlays::delete))
}
