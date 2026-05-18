use utoipa::{
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
    Modify, OpenApi,
};

/// Root OpenAPI document for CloudCut.
///
/// Served as JSON at  GET /api/v1/openapi.json
/// Swagger UI at      GET /api/v1/docs
#[derive(OpenApi)]
#[openapi(
    info(
        title       = "CloudCut API",
        version     = "1.0.0",
        description = "Collaborative video editor — Rust · Axum · PostgreSQL · Redis · Pusher"
    ),
    paths(
        // Auth
        crate::auth::routes::register,
        crate::auth::routes::login,
        crate::auth::routes::me,
        // Workspaces
        crate::workspaces::create_workspace,
        crate::workspaces::list_workspaces,
        // Projects
        crate::projects::create_project,
        crate::projects::list_projects,
        crate::projects::get_project,
        crate::projects::update_project,
        crate::projects::delete_project,
        // Collaboration — offline reconnect sync (§4.5)
        crate::collaboration::sync::list_operations,
    ),
    components(
        schemas(
            crate::auth::routes::RegisterBody,
            crate::auth::routes::LoginBody,
            crate::auth::routes::AuthResponse,
            crate::auth::routes::UserPayload,
            crate::workspaces::CreateWorkspaceBody,
            crate::workspaces::WorkspacePayload,
            crate::projects::CreateProjectBody,
            crate::projects::UpdateProjectBody,
            crate::projects::ProjectPayload,
            crate::collaboration::dto::OperationEntry,
            crate::collaboration::dto::OperationsResponse,
        )
    ),
    tags(
        (name = "auth",          description = "Authentication — register, login, current user"),
        (name = "workspaces",    description = "Workspace management and member roles"),
        (name = "projects",      description = "Project CRUD + timeline mutations"),
        (name = "collaboration", description = "Operation log for offline reconnect sync (§4.5)"),
    ),
    modifiers(&SecurityAddon),
)]
pub struct ApiDoc;

/// Injects the `bearer_auth` HTTP security scheme into the generated spec.
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
