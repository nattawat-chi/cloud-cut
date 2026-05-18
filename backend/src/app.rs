use axum::Router;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::{middleware, openapi::ApiDoc, state::AppState};

pub fn build(state: AppState) -> Router {
    let api_v1 = Router::new()
        .merge(crate::auth::router())
        .merge(crate::users::router())
        .merge(crate::workspaces::router())
        // collaboration registered before projects so /projects/:id/operations
        // is matched as a static segment before the dynamic :subresource routes.
        .merge(crate::collaboration::router())
        .merge(crate::projects::router())
        .merge(crate::timeline::router())
        .merge(crate::assets::router())
        .merge(crate::exports::router());

    Router::new()
        .nest("/api/v1", api_v1)
        // Swagger UI at /api/v1/docs — spec JSON at /api/v1/openapi.json
        .merge(
            SwaggerUi::new("/api/v1/docs")
                .url("/api/v1/openapi.json", ApiDoc::openapi()),
        )
        .layer(middleware::trace_layer())
        .layer(middleware::cors_layer())
        .layer(middleware::request_id_layer())
        .with_state(state)
}
