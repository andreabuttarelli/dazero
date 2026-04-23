use crate::db::Db;
use anyhow::Result;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

// ── Edge type ────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Edge {
    pub id: String,
    pub canvas_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub kind: Option<String>,
    pub label: Option<String>,
    pub data: Option<serde_json::Value>,
}

// ── Task / TaskList types ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub task_list_id: String,
    pub description: String,
    pub status: String,
    pub position: i64,
}

#[derive(Debug, Serialize)]
pub struct TaskList {
    pub id: String,
    pub node_id: String,
    pub title: Option<String>,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTask {
    pub description: String,
    #[serde(default)]
    pub position: Option<i64>,
}

#[derive(Debug, Deserialize, Default)]
pub struct PatchTask {
    pub description: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Debug, Serialize)]
pub struct CanvasFull {
    pub id: String,
    pub project_id: String,
    pub viewport: Viewport,
    pub nodes: Vec<serde_json::Value>,
    pub task_lists: Vec<serde_json::Value>,
    pub edges: Vec<serde_json::Value>,
}

// ── Edge input types ─────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct CreateEdge {
    pub source_node_id: String,
    pub target_node_id: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CanvasNode {
    pub id: String,
    pub canvas_id: String,
    pub kind: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub data: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateNode {
    pub kind: String,
    pub position_x: f64,
    pub position_y: f64,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default = "empty_obj")]
    pub data: serde_json::Value,
}

fn empty_obj() -> serde_json::Value {
    serde_json::json!({})
}

#[derive(Debug, Deserialize, Default)]
pub struct PatchNode {
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub data: Option<serde_json::Value>,
}

fn ensure_derived_edges(db: &Db, canvas_id: &str) -> Result<()> {
    // Collect (source_id, target_id) pairs from terminal nodes
    let rows: Vec<(String, String)> = {
        let conn = db.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id, data FROM nodes WHERE canvas_id = ? AND kind = 'terminal'")?;
        let rows: Vec<(String, String)> = stmt
            .query_map([canvas_id], |r| {
                let id: String = r.get(0)?;
                let data_s: String = r.get(1)?;
                Ok((id, data_s))
            })?
            .filter_map(|r| r.ok())
            .filter_map(|(target, data_s)| {
                let data: serde_json::Value = serde_json::from_str(&data_s).ok()?;
                let src = data.get("spawned_from_node_id")?.as_str()?.to_string();
                if src.is_empty() {
                    None
                } else {
                    Some((src, target))
                }
            })
            .collect();
        rows
    };

    for (source, target) in rows {
        let conn = db.lock().unwrap();
        // Check if an edge with same (source, target, kind='task_spawn') already exists
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM edges
                 WHERE canvas_id=? AND source_node_id=? AND target_node_id=? AND kind='task_spawn'",
                rusqlite::params![canvas_id, source, target],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if exists {
            continue;
        }

        // Verify source node still exists before inserting (defensive)
        let src_exists: bool = conn
            .query_row("SELECT 1 FROM nodes WHERE id=?", [&source], |_| Ok(true))
            .optional()?
            .unwrap_or(false);
        if !src_exists {
            continue;
        }

        let edge_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO edges(id, canvas_id, source_node_id, target_node_id, kind, label, data)
             VALUES (?, ?, ?, ?, 'task_spawn', NULL, NULL)",
            rusqlite::params![edge_id, canvas_id, source, target],
        )?;
    }
    Ok(())
}

pub fn get_full(db: &Db, id: &str) -> Result<Option<CanvasFull>> {
    let base: Option<(String, String, f64, f64, f64)> = {
        let conn = db.lock().unwrap();
        conn.query_row(
            "SELECT id, project_id, viewport_x, viewport_y, viewport_zoom FROM canvases WHERE id = ?",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .optional()?
    };
    let Some((id, project_id, vx, vy, vz)) = base else {
        return Ok(None);
    };

    // Idempotent migration of M2-style derived edges
    ensure_derived_edges(db, &id)?;

    let nodes_v = list_nodes(db, &id)?;
    let nodes_json: Vec<serde_json::Value> = nodes_v
        .into_iter()
        .map(|n| serde_json::to_value(&n).unwrap_or(serde_json::json!({})))
        .collect();
    let task_lists = list_task_lists(db, &id)?;
    let task_lists_json: Vec<serde_json::Value> = task_lists
        .into_iter()
        .map(|tl| serde_json::to_value(&tl).unwrap_or(serde_json::json!({})))
        .collect();
    let edges = list_edges(db, &id)?;
    let edges_json: Vec<serde_json::Value> = edges
        .into_iter()
        .map(|e| serde_json::to_value(&e).unwrap_or(serde_json::json!({})))
        .collect();
    Ok(Some(CanvasFull {
        id,
        project_id,
        viewport: Viewport {
            x: vx,
            y: vy,
            zoom: vz,
        },
        nodes: nodes_json,
        task_lists: task_lists_json,
        edges: edges_json,
    }))
}

pub fn create_node(db: &Db, canvas_id: &str, body: CreateNode) -> Result<Option<CanvasNode>> {
    {
        let conn = db.lock().unwrap();
        let exists: bool = conn
            .query_row("SELECT 1 FROM canvases WHERE id = ?", [canvas_id], |_| {
                Ok(true)
            })
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Ok(None);
        }
    }

    if body.kind != "terminal" && body.kind != "task_list" {
        return Err(anyhow::anyhow!("invalid node kind: {}", body.kind));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let data_json = serde_json::to_string(&body.data)?;

    {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO nodes(id,canvas_id,kind,position_x,position_y,width,height,data,created_at)
             VALUES(?,?,?,?,?,?,?,?,?)",
            rusqlite::params![
                id,
                canvas_id,
                body.kind,
                body.position_x,
                body.position_y,
                body.width,
                body.height,
                data_json,
                now
            ],
        )?;
    }

    if body.kind == "task_list" {
        let title = body.data.get("title").and_then(|v| v.as_str());
        create_task_list_for_node(db, &id, title)?;
    }

    get_node(db, &id)
}

pub fn get_node(db: &Db, id: &str) -> Result<Option<CanvasNode>> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT id,canvas_id,kind,position_x,position_y,width,height,data,created_at FROM nodes WHERE id = ?",
        [id],
        |r| {
            let data_s: String = r.get(7)?;
            let data: serde_json::Value =
                serde_json::from_str(&data_s).unwrap_or(serde_json::json!({}));
            Ok(CanvasNode {
                id: r.get(0)?,
                canvas_id: r.get(1)?,
                kind: r.get(2)?,
                position_x: r.get(3)?,
                position_y: r.get(4)?,
                width: r.get(5)?,
                height: r.get(6)?,
                data,
                created_at: r.get(8)?,
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
}

pub fn list_nodes(db: &Db, canvas_id: &str) -> Result<Vec<CanvasNode>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id,canvas_id,kind,position_x,position_y,width,height,data,created_at
         FROM nodes WHERE canvas_id = ? ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([canvas_id], |r| {
        let data_s: String = r.get(7)?;
        let data: serde_json::Value =
            serde_json::from_str(&data_s).unwrap_or(serde_json::json!({}));
        Ok(CanvasNode {
            id: r.get(0)?,
            canvas_id: r.get(1)?,
            kind: r.get(2)?,
            position_x: r.get(3)?,
            position_y: r.get(4)?,
            width: r.get(5)?,
            height: r.get(6)?,
            data,
            created_at: r.get(8)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn update_node(db: &Db, id: &str, patch: PatchNode) -> Result<Option<CanvasNode>> {
    {
        let conn = db.lock().unwrap();
        if let Some(v) = patch.position_x {
            conn.execute(
                "UPDATE nodes SET position_x = ? WHERE id = ?",
                rusqlite::params![v, id],
            )?;
        }
        if let Some(v) = patch.position_y {
            conn.execute(
                "UPDATE nodes SET position_y = ? WHERE id = ?",
                rusqlite::params![v, id],
            )?;
        }
        if let Some(v) = patch.width {
            conn.execute(
                "UPDATE nodes SET width = ? WHERE id = ?",
                rusqlite::params![v, id],
            )?;
        }
        if let Some(v) = patch.height {
            conn.execute(
                "UPDATE nodes SET height = ? WHERE id = ?",
                rusqlite::params![v, id],
            )?;
        }
        if let Some(v) = patch.data {
            let s = serde_json::to_string(&v)?;
            conn.execute(
                "UPDATE nodes SET data = ? WHERE id = ?",
                rusqlite::params![s, id],
            )?;
        }
    }
    get_node(db, id)
}

pub fn delete_node(db: &Db, id: &str) -> Result<bool> {
    let conn = db.lock().unwrap();
    let n = conn.execute("DELETE FROM nodes WHERE id = ?", [id])?;
    Ok(n > 0)
}

#[derive(Debug, serde::Deserialize)]
pub struct PatchViewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

pub fn update_viewport(db: &Db, id: &str, v: PatchViewport) -> Result<bool> {
    let conn = db.lock().unwrap();
    let n = conn.execute(
        "UPDATE canvases SET viewport_x = ?, viewport_y = ?, viewport_zoom = ? WHERE id = ?",
        rusqlite::params![v.x, v.y, v.zoom, id],
    )?;
    Ok(n > 0)
}

// ── Task list functions ──────────────────────────────────────────────────────

/// Called from within create_node when kind=task_list.
pub fn create_task_list_for_node(db: &Db, node_id: &str, title: Option<&str>) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT INTO task_lists(id, node_id, title) VALUES(?,?,?)",
        rusqlite::params![id, node_id, title],
    )?;
    Ok(id)
}

pub fn list_task_lists(db: &Db, canvas_id: &str) -> Result<Vec<TaskList>> {
    let base: Vec<(String, String, Option<String>)> = {
        let conn = db.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT tl.id, tl.node_id, tl.title
             FROM task_lists tl
             JOIN nodes n ON n.id = tl.node_id
             WHERE n.canvas_id = ?
             ORDER BY n.created_at ASC",
        )?;
        let rows: Vec<(String, String, Option<String>)> = stmt
            .query_map([canvas_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .filter_map(Result::ok)
            .collect();
        rows
    };

    let mut out = Vec::with_capacity(base.len());
    for (id, node_id, title) in base {
        let tasks: Vec<Task> = {
            let conn = db.lock().unwrap();
            let mut q = conn.prepare(
                "SELECT id, task_list_id, description, status, position
                 FROM tasks WHERE task_list_id = ? ORDER BY position ASC",
            )?;
            let rows: Vec<Task> = q
                .query_map([&id], |r| {
                    Ok(Task {
                        id: r.get(0)?,
                        task_list_id: r.get(1)?,
                        description: r.get(2)?,
                        status: r.get(3)?,
                        position: r.get(4)?,
                    })
                })?
                .filter_map(Result::ok)
                .collect();
            rows
        };
        out.push(TaskList {
            id,
            node_id,
            title,
            tasks,
        });
    }
    Ok(out)
}

pub fn add_task(db: &Db, task_list_id: &str, body: CreateTask) -> Result<Option<Task>> {
    // Verify list exists
    {
        let conn = db.lock().unwrap();
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM task_lists WHERE id = ?",
                [task_list_id],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Ok(None);
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let position = match body.position {
        Some(p) => p,
        None => {
            let conn = db.lock().unwrap();
            conn.query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE task_list_id = ?",
                [task_list_id],
                |r| r.get(0),
            )?
        }
    };
    {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO tasks(id, task_list_id, description, status, position)
             VALUES(?,?,?,'pending',?)",
            rusqlite::params![id, task_list_id, body.description, position],
        )?;
    }
    get_task(db, &id)
}

pub fn get_task(db: &Db, id: &str) -> Result<Option<Task>> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT id, task_list_id, description, status, position FROM tasks WHERE id = ?",
        [id],
        |r| {
            Ok(Task {
                id: r.get(0)?,
                task_list_id: r.get(1)?,
                description: r.get(2)?,
                status: r.get(3)?,
                position: r.get(4)?,
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
}

pub fn update_task(db: &Db, id: &str, patch: PatchTask) -> Result<Option<Task>> {
    {
        let conn = db.lock().unwrap();
        if let Some(ref d) = patch.description {
            conn.execute(
                "UPDATE tasks SET description = ? WHERE id = ?",
                rusqlite::params![d, id],
            )?;
        }
        if let Some(ref s) = patch.status {
            if s != "pending" && s != "done" {
                return Err(anyhow::anyhow!("invalid status: {s}"));
            }
            conn.execute(
                "UPDATE tasks SET status = ? WHERE id = ?",
                rusqlite::params![s, id],
            )?;
        }
    }
    get_task(db, id)
}

pub fn delete_task(db: &Db, id: &str) -> Result<bool> {
    let conn = db.lock().unwrap();
    let n = conn.execute("DELETE FROM tasks WHERE id = ?", [id])?;
    Ok(n > 0)
}

// ── Edge CRUD ────────────────────────────────────────────────────────────────

pub fn create_edge(db: &Db, canvas_id: &str, body: CreateEdge) -> Result<Option<Edge>> {
    // Verify canvas exists
    {
        let conn = db.lock().unwrap();
        let exists: bool = conn
            .query_row("SELECT 1 FROM canvases WHERE id=?", [canvas_id], |_| {
                Ok(true)
            })
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Ok(None);
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let data_s = body.data.as_ref().map(serde_json::to_string).transpose()?;

    {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO edges(id,canvas_id,source_node_id,target_node_id,kind,label,data)
             VALUES(?,?,?,?,?,?,?)",
            rusqlite::params![
                id,
                canvas_id,
                body.source_node_id,
                body.target_node_id,
                body.kind,
                body.label,
                data_s
            ],
        )?;
    }
    get_edge(db, &id)
}

pub fn get_edge(db: &Db, id: &str) -> Result<Option<Edge>> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT id,canvas_id,source_node_id,target_node_id,kind,label,data FROM edges WHERE id=?",
        [id],
        |r| {
            let data_s: Option<String> = r.get(6)?;
            let data = data_s.and_then(|s| serde_json::from_str(&s).ok());
            Ok(Edge {
                id: r.get(0)?,
                canvas_id: r.get(1)?,
                source_node_id: r.get(2)?,
                target_node_id: r.get(3)?,
                kind: r.get(4)?,
                label: r.get(5)?,
                data,
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
}

pub fn list_edges(db: &Db, canvas_id: &str) -> Result<Vec<Edge>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id,canvas_id,source_node_id,target_node_id,kind,label,data
         FROM edges WHERE canvas_id=?",
    )?;
    let rows: Vec<Edge> = stmt
        .query_map([canvas_id], |r| {
            let data_s: Option<String> = r.get(6)?;
            let data = data_s.and_then(|s| serde_json::from_str(&s).ok());
            Ok(Edge {
                id: r.get(0)?,
                canvas_id: r.get(1)?,
                source_node_id: r.get(2)?,
                target_node_id: r.get(3)?,
                kind: r.get(4)?,
                label: r.get(5)?,
                data,
            })
        })?
        .filter_map(Result::ok)
        .collect();
    Ok(rows)
}

pub fn delete_edge(db: &Db, id: &str) -> Result<bool> {
    let conn = db.lock().unwrap();
    let n = conn.execute("DELETE FROM edges WHERE id=?", [id])?;
    Ok(n > 0)
}
