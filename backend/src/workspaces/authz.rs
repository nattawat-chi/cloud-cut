//! Centralised workspace authorization (§2.6 role matrix).
//!
//! Replaces the per-module `require_workspace_member` / `require_project_access`
//! helpers (which were boolean: member-or-not).  Every handler now declares
//! the *minimum role* it requires; this module returns the caller's actual
//! role on success so handlers can branch on it when needed.
//!
//! Role ordering (least → most privileged): viewer < editor < admin < owner
//!
//! | Capability       | Minimum role |
//! | ---------------- | ------------ |
//! | View             | viewer       |
//! | Upload asset     | editor       |
//! | Edit timeline    | editor       |
//! | Create export    | editor       |
//! | Invite member    | admin        |
//! | Manage members   | admin        |

use std::str::FromStr;

use uuid::Uuid;

use crate::{error::AppError, state::AppState};

/// Workspace member role, ordered least-to-most privileged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Viewer = 0,
    Editor = 1,
    Admin  = 2,
    Owner  = 3,
}

impl FromStr for Role {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "viewer" => Ok(Self::Viewer),
            "editor" => Ok(Self::Editor),
            "admin"  => Ok(Self::Admin),
            "owner"  => Ok(Self::Owner),
            other    => Err(AppError::internal(format!("unknown role in DB: {other}"))),
        }
    }
}

impl std::fmt::Display for Role {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Viewer => "viewer",
            Self::Editor => "editor",
            Self::Admin  => "admin",
            Self::Owner  => "owner",
        })
    }
}

/// Check that `user_id` has at least `min_role` in `workspace_id`.
///
/// Returns the caller's actual role on success; returns
/// - `AppError::Forbidden` if the caller is not a member, or has a lower role
///   than required.
pub async fn require_workspace_role(
    state:        &AppState,
    workspace_id: Uuid,
    user_id:      Uuid,
    min_role:     Role,
) -> Result<Role, AppError> {
    let role_str: Option<String> = sqlx::query_scalar(
        "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let role_str = role_str.ok_or(AppError::Forbidden)?;
    let role = Role::from_str(&role_str)?;

    if role < min_role {
        return Err(AppError::Forbidden);
    }
    Ok(role)
}

/// Check that `user_id` has at least `min_role` in the workspace that owns
/// `project_id`.  Returns the caller's role; 404 if the project doesn't exist
/// (or is archived), 403 if the caller isn't a member or lacks the role.
pub async fn require_project_role(
    state:      &AppState,
    project_id: Uuid,
    user_id:    Uuid,
    min_role:   Role,
) -> Result<Role, AppError> {
    let row: Option<(Uuid, Option<String>)> = sqlx::query_as(
        r#"
        SELECT p.workspace_id, wm.role::text
        FROM   projects p
        LEFT   JOIN workspace_members wm
               ON  wm.workspace_id = p.workspace_id
               AND wm.user_id      = $2
        WHERE  p.id = $1 AND p.archived = false
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (_workspace_id, role_opt) = row.ok_or_else(|| AppError::NotFound("project".into()))?;
    let role_str = role_opt.ok_or(AppError::Forbidden)?;
    let role = Role::from_str(&role_str)?;

    if role < min_role {
        return Err(AppError::Forbidden);
    }
    Ok(role)
}
