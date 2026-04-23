use crate::db::Db;
use anyhow::{Context, Result};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub git_remote: Option<String>,
    pub created_at: i64,
    pub last_opened_at: Option<i64>,
    pub canvas_id: String,
}

pub fn create_from_folder(db: &Db, path: &Path, name: Option<String>) -> Result<Project> {
    let abs = std::fs::canonicalize(path).context("canonicalize path")?;
    let name = name.unwrap_or_else(|| {
        abs.file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "untitled".into())
    });
    let git_remote = detect_git_remote(&abs);
    let id = uuid::Uuid::new_v4().to_string();
    let canvas_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO projects(id,name,path,git_remote,created_at,last_opened_at) VALUES(?,?,?,?,?,?)",
            rusqlite::params![id, name, abs.to_string_lossy(), git_remote, now, now],
        )?;
        conn.execute(
            "INSERT INTO canvases(id,project_id) VALUES(?,?)",
            rusqlite::params![canvas_id, id],
        )?;
    }

    Ok(Project {
        id,
        name,
        path: abs.to_string_lossy().to_string(),
        git_remote,
        created_at: now,
        last_opened_at: Some(now),
        canvas_id,
    })
}

pub fn create_from_clone(db: &Db, git_url: &str, name: Option<String>) -> Result<Project> {
    let base = std::env::var("DAZERO_PROJECTS_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_default()
                .join(".dazero/projects")
        });
    std::fs::create_dir_all(&base)?;

    let normalized = normalize_github_shorthand(git_url);
    let url_for_clone = normalized.as_deref().unwrap_or(git_url);

    let derived_name = name.clone().unwrap_or_else(|| {
        url_for_clone
            .rsplit('/')
            .next()
            .unwrap_or("project")
            .trim_end_matches(".git")
            .to_string()
    });
    let dest = base.join(&derived_name);
    if dest.exists() {
        return Err(anyhow::anyhow!(
            "target directory already exists: {}",
            dest.display()
        ));
    }

    let status = if is_github_url(url_for_clone) && gh_cli_available() {
        let owner_repo =
            github_owner_repo(url_for_clone).unwrap_or_else(|| url_for_clone.to_string());
        std::process::Command::new("gh")
            .args(["repo", "clone", &owner_repo, dest.to_str().unwrap()])
            .status()
            .context("invoke gh repo clone")?
    } else {
        std::process::Command::new("git")
            .args(["clone", url_for_clone, dest.to_str().unwrap()])
            .status()
            .context("invoke git clone")?
    };
    if !status.success() {
        return Err(anyhow::anyhow!("clone failed with status {status}"));
    }
    create_from_folder(db, &dest, Some(derived_name))
}

/// Expand short GitHub references like `owner/repo` into a full HTTPS URL.
/// Returns None if the input already looks like a URL or an SSH spec.
fn normalize_github_shorthand(s: &str) -> Option<String> {
    let trimmed = s.trim();
    if trimmed.contains("://") || trimmed.contains('@') || trimmed.starts_with("git") {
        return None;
    }
    let parts: Vec<&str> = trimmed.split('/').collect();
    if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        Some(format!("https://github.com/{}/{}", parts[0], parts[1]))
    } else {
        None
    }
}

fn is_github_url(s: &str) -> bool {
    s.contains("github.com")
}

/// Extract `owner/repo` from a GitHub URL (HTTPS or SSH). Returns None on malformed input.
fn github_owner_repo(url: &str) -> Option<String> {
    let path = if let Some(rest) = url.strip_prefix("https://github.com/") {
        rest.to_string()
    } else if let Some(rest) = url.strip_prefix("http://github.com/") {
        rest.to_string()
    } else if let Some(rest) = url.strip_prefix("git@github.com:") {
        rest.to_string()
    } else {
        return None;
    };
    let path = path.trim_end_matches('/').trim_end_matches(".git");
    let parts: Vec<&str> = path.splitn(2, '/').collect();
    if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        Some(format!("{}/{}", parts[0], parts[1]))
    } else {
        None
    }
}

fn gh_cli_available() -> bool {
    std::process::Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn list(db: &Db) -> Result<Vec<Project>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT p.id,p.name,p.path,p.git_remote,p.created_at,p.last_opened_at,c.id
         FROM projects p
         LEFT JOIN canvases c ON c.project_id = p.id
         ORDER BY COALESCE(p.last_opened_at, 0) DESC, p.created_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Project {
            id: r.get(0)?,
            name: r.get(1)?,
            path: r.get(2)?,
            git_remote: r.get(3)?,
            created_at: r.get(4)?,
            last_opened_at: r.get(5)?,
            canvas_id: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn get(db: &Db, id: &str) -> Result<Option<Project>> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT p.id,p.name,p.path,p.git_remote,p.created_at,p.last_opened_at,c.id
         FROM projects p
         LEFT JOIN canvases c ON c.project_id = p.id
         WHERE p.id = ?",
        [id],
        |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                path: r.get(2)?,
                git_remote: r.get(3)?,
                created_at: r.get(4)?,
                last_opened_at: r.get(5)?,
                canvas_id: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
}

#[derive(Debug, serde::Deserialize, Default)]
pub struct PatchProject {
    pub name: Option<String>,
    pub last_opened_at: Option<i64>,
}

pub fn update(db: &Db, id: &str, patch: PatchProject) -> Result<Option<Project>> {
    {
        let conn = db.lock().unwrap();
        if let Some(n) = patch.name.as_ref() {
            conn.execute(
                "UPDATE projects SET name = ? WHERE id = ?",
                rusqlite::params![n, id],
            )?;
        }
        if let Some(t) = patch.last_opened_at {
            conn.execute(
                "UPDATE projects SET last_opened_at = ? WHERE id = ?",
                rusqlite::params![t, id],
            )?;
        }
    }
    get(db, id)
}

pub fn delete(db: &Db, id: &str) -> Result<bool> {
    let conn = db.lock().unwrap();
    let n = conn.execute("DELETE FROM projects WHERE id = ?", [id])?;
    Ok(n > 0)
}

fn detect_git_remote(path: &Path) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["-C"])
        .arg(path)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}
