use crate::db::Db;
use anyhow::{Context, Result};
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
    let derived_name = name.clone().unwrap_or_else(|| {
        git_url
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
    let status = std::process::Command::new("git")
        .args(["clone", git_url, dest.to_str().unwrap()])
        .status()
        .context("invoke git clone")?;
    if !status.success() {
        return Err(anyhow::anyhow!("git clone failed with status {status}"));
    }
    create_from_folder(db, &dest, Some(derived_name))
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
