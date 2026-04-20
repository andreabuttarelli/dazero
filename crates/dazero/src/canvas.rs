use crate::db::Db;
use anyhow::Result;
use rusqlite::OptionalExtension;
use serde::Serialize;

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
    pub nodes: Vec<serde_json::Value>, // empty in Task 5, Task 6 populates
    pub task_lists: Vec<serde_json::Value>, // empty in Task 5, Task 7 populates
}

pub fn get_full(db: &Db, id: &str) -> Result<Option<CanvasFull>> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, viewport_x, viewport_y, viewport_zoom FROM canvases WHERE id = ?",
        [id],
        |r| {
            Ok(CanvasFull {
                id: r.get(0)?,
                project_id: r.get(1)?,
                viewport: Viewport {
                    x: r.get(2)?,
                    y: r.get(3)?,
                    zoom: r.get(4)?,
                },
                nodes: vec![],
                task_lists: vec![],
            })
        },
    )
    .optional()
    .map_err(anyhow::Error::from)
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
