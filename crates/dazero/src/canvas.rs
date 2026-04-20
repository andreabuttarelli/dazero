use crate::db::Db;
use anyhow::Result;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

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
    pub task_lists: Vec<serde_json::Value>, // empty in Task 5, Task 7 populates
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
    let nodes_v = list_nodes(db, &id)?;
    let nodes_json: Vec<serde_json::Value> = nodes_v
        .into_iter()
        .map(|n| serde_json::to_value(&n).unwrap_or(serde_json::json!({})))
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
        task_lists: vec![],
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
