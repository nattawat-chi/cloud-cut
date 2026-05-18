use std::str::FromStr;

use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, models::Role};

/// Resolve the caller's role for a **project** (via the project's workspace).
///
/// Returns the resolved [`Role`] when the caller meets `min_role`.
/// Returns 404 if the project doesn't exist, 403 if the caller is not a member
/// or their role is below the minimum.
pub async fn require_role(
    pool:      &PgPool,
    user_id:   Uuid,
    project_id: Uuid,
    min_role:  Role,
) -> Result<Role, AppError> {
    // Single query: LEFT JOIN gives us NULL role when user is not a member.
    let row: Option<(Option<String>,)> = sqlx::query_as(
        r#"
        SELECT wm.role::text
        FROM   projects p
        LEFT   JOIN workspace_members wm
               ON  wm.workspace_id = p.workspace_id
               AND wm.user_id      = $2
        WHERE  p.id = $1
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let (role_opt,) = row.ok_or_else(|| AppError::NotFound(format!("project {project_id}")))?;

    let role_str = role_opt.ok_or_else(|| {
        AppError::Forbidden("not a member of this project's workspace".into())
    })?;

    let role = Role::from_str(&role_str)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{e}")))?;

    if role < min_role {
        return Err(AppError::Forbidden(format!(
            "requires {min_role} or higher; caller has {role}",
        )));
    }

    Ok(role)
}

/// Resolve the caller's role directly in a **workspace** (no project lookup needed).
///
/// Used for workspace-level mutations: create project, invite member, manage roles.
pub async fn require_workspace_role(
    pool:         &PgPool,
    user_id:      Uuid,
    workspace_id: Uuid,
    min_role:     Role,
) -> Result<Role, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let (role_str,) = row.ok_or_else(|| {
        AppError::Forbidden("not a member of this workspace".into())
    })?;

    let role = Role::from_str(&role_str)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{e}")))?;

    if role < min_role {
        return Err(AppError::Forbidden(format!(
            "requires {min_role} or higher; caller has {role}",
        )));
    }

    Ok(role)
}
