//! Integration tests — workspace role-based permission enforcement (§2.6).
//!
//! Tests are split into two layers:
//!
//!   1. Pure unit tests for the `Role` enum ordering — no I/O required.
//!   2. HTTP-level integration tests that build a minimal Axum router, inject the
//!      caller's role via `axum::Extension`, and assert 200/403 per the auth matrix.
//!
//! Authorization matrix reproduced here for reference:
//!
//! | Capability      | Minimum role |
//! |-----------------|--------------|
//! | View project    | viewer       |
//! | Upload asset    | editor       |
//! | Edit timeline   | editor       |
//! | Create export   | editor       |
//! | Invite member   | admin        |
//! | Manage members  | admin        |

use axum::{
    body::Body,
    extract::Extension,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Router,
};
use tower::ServiceExt;

// ── Role enum (mirrors workspaces/authz.rs) ────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Role {
    Viewer = 0,
    Editor = 1,
    Admin  = 2,
    Owner  = 3,
}

// ── Unit tests: Role ordering ──────────────────────────────────────────────────

mod role_ordering {
    use super::Role;

    #[test]
    fn full_hierarchy_is_ordered() {
        assert!(Role::Viewer < Role::Editor);
        assert!(Role::Editor < Role::Admin);
        assert!(Role::Admin  < Role::Owner);
    }

    #[test]
    fn viewer_lacks_editor_access() {
        assert!(Role::Viewer < Role::Editor);
    }

    #[test]
    fn editor_meets_editor_requirement() {
        assert!(Role::Editor >= Role::Editor);
    }

    #[test]
    fn editor_lacks_admin_access() {
        assert!(Role::Editor < Role::Admin);
    }

    #[test]
    fn admin_meets_admin_requirement() {
        assert!(Role::Admin >= Role::Admin);
    }

    #[test]
    fn owner_passes_every_gate() {
        assert!(Role::Owner >= Role::Viewer);
        assert!(Role::Owner >= Role::Editor);
        assert!(Role::Owner >= Role::Admin);
        assert!(Role::Owner >= Role::Owner);
    }
}

// ── Middleware factories ───────────────────────────────────────────────────────

async fn require_viewer(
    Extension(role): Extension<Role>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if role >= Role::Viewer {
        next.run(req).await
    } else {
        (StatusCode::FORBIDDEN, "insufficient role").into_response()
    }
}

async fn require_editor(
    Extension(role): Extension<Role>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if role >= Role::Editor {
        next.run(req).await
    } else {
        (StatusCode::FORBIDDEN, "insufficient role").into_response()
    }
}

async fn require_admin(
    Extension(role): Extension<Role>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if role >= Role::Admin {
        next.run(req).await
    } else {
        (StatusCode::FORBIDDEN, "insufficient role").into_response()
    }
}

// ── Test router ───────────────────────────────────────────────────────────────

fn app(caller_role: Role) -> Router {
    Router::new()
        // viewer+ : read project / timeline state
        .route(
            "/projects/:id",
            get(|| async { StatusCode::OK }).layer(middleware::from_fn(require_viewer)),
        )
        // editor+ : edit timeline, upload assets, create export
        .route(
            "/projects/:id/clips",
            post(|| async { StatusCode::OK }).layer(middleware::from_fn(require_editor)),
        )
        .route(
            "/projects/:id/clips/:cid",
            patch(|| async { StatusCode::OK }).layer(middleware::from_fn(require_editor)),
        )
        .route(
            "/projects/:id/exports",
            post(|| async { StatusCode::OK }).layer(middleware::from_fn(require_editor)),
        )
        .route(
            "/assets/presigned-url",
            post(|| async { StatusCode::OK }).layer(middleware::from_fn(require_editor)),
        )
        // admin+ : invite / manage members
        .route(
            "/workspaces/:id/invite",
            post(|| async { StatusCode::OK }).layer(middleware::from_fn(require_admin)),
        )
        .route(
            "/workspaces/:id/members/:uid",
            delete(|| async { StatusCode::OK }).layer(middleware::from_fn(require_admin)),
        )
        // inject caller role for every request
        .layer(Extension(caller_role))
}

async fn call(router: Router, method: &str, uri: &str) -> StatusCode {
    router
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
        .status()
}

// ── Viewer ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn viewer_can_read_project() {
    let s = call(app(Role::Viewer), "GET", "/projects/proj-1").await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn viewer_cannot_add_clip() {
    let s = call(app(Role::Viewer), "POST", "/projects/proj-1/clips").await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn viewer_cannot_create_export() {
    let s = call(app(Role::Viewer), "POST", "/projects/proj-1/exports").await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn viewer_cannot_upload_asset() {
    let s = call(app(Role::Viewer), "POST", "/assets/presigned-url").await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn viewer_cannot_invite_members() {
    let s = call(app(Role::Viewer), "POST", "/workspaces/ws-1/invite").await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

// ── Editor ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn editor_can_add_clip() {
    let s = call(app(Role::Editor), "POST", "/projects/proj-1/clips").await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn editor_can_patch_clip() {
    let s = call(app(Role::Editor), "PATCH", "/projects/proj-1/clips/clip-1").await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn editor_can_create_export() {
    let s = call(app(Role::Editor), "POST", "/projects/proj-1/exports").await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn editor_can_upload_asset() {
    let s = call(app(Role::Editor), "POST", "/assets/presigned-url").await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn editor_cannot_invite_members() {
    let s = call(app(Role::Editor), "POST", "/workspaces/ws-1/invite").await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn editor_cannot_remove_members() {
    let s = call(app(Role::Editor), "DELETE", "/workspaces/ws-1/members/user-2").await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn admin_can_invite_members() {
    let s = call(app(Role::Admin), "POST", "/workspaces/ws-1/invite").await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn admin_can_remove_members() {
    let s = call(app(Role::Admin), "DELETE", "/workspaces/ws-1/members/user-2").await;
    assert_eq!(s, StatusCode::OK);
}

// ── Owner ─────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn owner_passes_all_gates() {
    let router = app(Role::Owner);

    // Need separate router instances (oneshot consumes)
    assert_eq!(call(app(Role::Owner), "GET",    "/projects/proj-1").await,              StatusCode::OK);
    assert_eq!(call(app(Role::Owner), "POST",   "/projects/proj-1/clips").await,        StatusCode::OK);
    assert_eq!(call(app(Role::Owner), "PATCH",  "/projects/proj-1/clips/clip-1").await, StatusCode::OK);
    assert_eq!(call(app(Role::Owner), "POST",   "/projects/proj-1/exports").await,      StatusCode::OK);
    assert_eq!(call(app(Role::Owner), "POST",   "/assets/presigned-url").await,         StatusCode::OK);
    assert_eq!(call(app(Role::Owner), "POST",   "/workspaces/ws-1/invite").await,       StatusCode::OK);
    assert_eq!(call(app(Role::Owner), "DELETE", "/workspaces/ws-1/members/user-2").await, StatusCode::OK);

    drop(router); // suppress unused warning
}
