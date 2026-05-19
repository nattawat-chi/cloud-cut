//! Root OpenAPI document for the CloudCut API.
//!
//! Served at:
//!   GET /api/v1/docs           — Swagger UI
//!   GET /api/v1/openapi.json   — raw spec
//!
//! Currently covers the 14 most-used endpoints (auth, workspaces, projects,
//! collaboration sync, exports).  Adding more is straightforward: derive
//! `ToSchema` on the DTO, attach `#[utoipa::path(...)]` to the handler,
//! then list both here.

use utoipa::{
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
    Modify, OpenApi,
};

#[derive(OpenApi)]
#[openapi(
    info(
        title       = "CloudCut API",
        version     = "1.0.0",
        description = "Collaborative video editor — Rust · Axum · PostgreSQL · Redis · Pusher",
    ),
    paths(
        // Auth
        crate::auth::handlers::register,
        crate::auth::handlers::login,
        crate::auth::handlers::refresh,
        crate::auth::handlers::me,
        // Workspaces
        crate::workspaces::list_workspaces,
        // Projects
        crate::projects::handlers::list_projects,
        crate::projects::handlers::create_project,
        crate::projects::handlers::get_project,
        crate::projects::handlers::update_project,
        crate::projects::handlers::archive_project,
        // Collaboration — offline reconnect sync (§4.5)
        crate::collaboration::handlers::list_operations,
        // Exports
        crate::exports::handlers::create_export,
        crate::exports::handlers::get_export,
        crate::exports::handlers::list_exports,
    ),
    components(
        schemas(
            // Auth
            crate::auth::models::RegisterRequest,
            crate::auth::models::LoginRequest,
            crate::auth::models::RefreshRequest,
            crate::auth::models::UserResponse,
            crate::auth::models::TokenPairResponse,
            crate::auth::models::AccessTokenResponse,
            // Workspaces
            crate::workspaces::WorkspaceRow,
            // Projects
            crate::projects::models::ProjectRow,
            crate::projects::models::CreateProjectReq,
            crate::projects::models::UpdateProjectReq,
            crate::projects::models::PagedProjects,
            // Collaboration
            crate::collaboration::models::OperationEntry,
            crate::collaboration::models::OperationsResponse,
            // Exports
            crate::exports::models::ExportJobRow,
            crate::exports::models::CreateExportReq,
            crate::exports::models::ExportJobCreated,
        )
    ),
    tags(
        (name = "auth",          description = "Registration, login, JWT refresh, current user"),
        (name = "workspaces",    description = "Workspaces the caller belongs to"),
        (name = "projects",      description = "Project CRUD"),
        (name = "collaboration", description = "Operation log replay for offline reconnect (§4.5)"),
        (name = "exports",       description = "Export jobs — queued via Redis stream, processed by worker"),
    ),
    modifiers(&SecurityAddon),
)]
pub struct ApiDoc;

/// Injects the `bearer_auth` HTTP security scheme into the spec so endpoints
/// marked with `security(("bearer_auth" = []))` render a working
/// "Authorize" button in Swagger UI.
pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(
                    Http::builder()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .build(),
                ),
            );
        }
    }
}
