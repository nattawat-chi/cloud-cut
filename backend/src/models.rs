use std::str::FromStr;

/// Workspace member roles, ordered least-to-most privileged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Viewer = 0,
    Editor = 1,
    Admin  = 2,
    Owner  = 3,
}

impl FromStr for Role {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "viewer" => Ok(Self::Viewer),
            "editor" => Ok(Self::Editor),
            "admin"  => Ok(Self::Admin),
            "owner"  => Ok(Self::Owner),
            other    => anyhow::bail!("unknown role: {other}"),
        }
    }
}

impl std::fmt::Display for Role {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Viewer => "viewer",
            Self::Editor => "editor",
            Self::Admin  => "admin",
            Self::Owner  => "owner",
        };
        f.write_str(s)
    }
}
