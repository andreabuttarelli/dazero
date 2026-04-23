use crate::agent_config::Config as AgentCfg;
use crate::canvas;
use crate::db::Db;
use crate::project;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

#[derive(Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum CreateProject {
    Folder {
        path: String,
        #[serde(default)]
        name: Option<String>,
    },
    Clone {
        git_url: String,
        #[serde(default)]
        name: Option<String>,
    },
}

#[derive(Clone)]
pub struct ApiState {
    pub db: Db,
    pub pty: Arc<crate::pty::PtyRegistry>,
    pub agent_config: Arc<TokioMutex<AgentCfg>>,
    pub agent_config_path: std::path::PathBuf,
}

pub fn routes(state: ApiState) -> Router {
    Router::new()
        .route("/api/projects", post(create_project).get(list_projects))
        .route(
            "/api/projects/{id}",
            get(get_project).patch(patch_project).delete(delete_project),
        )
        .route("/api/canvases/{id}", get(get_canvas))
        .route("/api/canvases/{id}/viewport", patch(patch_viewport))
        .route("/api/canvases/{id}/nodes", post(create_node))
        .route("/api/nodes/{id}", patch(patch_node).delete(delete_node))
        .route("/api/task-lists/{id}/tasks", post(create_task_handler))
        .route(
            "/api/tasks/{id}",
            patch(patch_task_handler).delete(delete_task_handler),
        )
        .route("/api/canvases/{id}/edges", post(create_edge_handler))
        .route("/api/edges/{id}", delete(delete_edge_handler))
        .route("/api/agents", post(create_agent))
        .route("/api/agents/{id}", axum::routing::delete(delete_agent))
        .route("/api/system/pick-directory", post(pick_directory))
        .route("/api/agent-presets", get(get_agent_presets))
        .route("/ws/pty/{id}", get(crate::ws::pty_by_id_handler))
        .with_state(state)
}

async fn get_agent_presets(State(state): State<ApiState>) -> Json<serde_json::Value> {
    let cfg = state.agent_config.lock().await;
    Json(serde_json::json!({
        "max_concurrent_agents": cfg.max_concurrent_agents,
        "presets": cfg.presets,
    }))
}

async fn create_project(
    State(state): State<ApiState>,
    Json(body): Json<CreateProject>,
) -> Result<(StatusCode, Json<project::Project>), AppError> {
    let p = match body {
        CreateProject::Folder { path, name } => {
            project::create_from_folder(&state.db, std::path::Path::new(&path), name)?
        }
        CreateProject::Clone { git_url, name } => {
            match project::create_from_clone(&state.db, &git_url, name) {
                Ok(p) => p,
                Err(e) if e.to_string().contains("already exists") => {
                    return Err(AppError::conflict(e.to_string()));
                }
                Err(e) => return Err(AppError::from(e)),
            }
        }
    };
    Ok((StatusCode::CREATED, Json(p)))
}

async fn list_projects(
    State(state): State<ApiState>,
) -> Result<Json<Vec<project::Project>>, AppError> {
    Ok(Json(project::list(&state.db)?))
}

async fn get_project(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<Json<project::Project>, AppError> {
    project::get(&state.db, &id)?
        .map(Json)
        .ok_or_else(|| AppError::not_found("project not found"))
}

async fn patch_project(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    Json(body): Json<project::PatchProject>,
) -> Result<Json<project::Project>, AppError> {
    project::update(&state.db, &id, body)?
        .map(Json)
        .ok_or_else(|| AppError::not_found("project not found"))
}

async fn delete_project(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if project::delete(&state.db, &id)? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("project not found"))
    }
}

async fn get_canvas(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<Json<canvas::CanvasFull>, AppError> {
    canvas::get_full(&state.db, &id)?
        .map(Json)
        .ok_or_else(|| AppError::not_found("canvas not found"))
}

async fn patch_viewport(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    Json(body): Json<canvas::PatchViewport>,
) -> Result<StatusCode, AppError> {
    if canvas::update_viewport(&state.db, &id, body)? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("canvas not found"))
    }
}

async fn create_node(
    State(state): State<ApiState>,
    Path(canvas_id): Path<String>,
    Json(body): Json<canvas::CreateNode>,
) -> Result<(StatusCode, Json<canvas::CanvasNode>), AppError> {
    match canvas::create_node(&state.db, &canvas_id, body)? {
        Some(n) => Ok((StatusCode::CREATED, Json(n))),
        None => Err(AppError::not_found("canvas not found")),
    }
}

async fn patch_node(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    Json(body): Json<canvas::PatchNode>,
) -> Result<Json<canvas::CanvasNode>, AppError> {
    if canvas::get_node(&state.db, &id)?.is_none() {
        return Err(AppError::not_found("node not found"));
    }
    canvas::update_node(&state.db, &id, body)?
        .map(Json)
        .ok_or_else(|| AppError::not_found("node not found"))
}

async fn delete_node(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if canvas::delete_node(&state.db, &id)? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("node not found"))
    }
}

async fn create_task_handler(
    State(state): State<ApiState>,
    Path(list_id): Path<String>,
    Json(body): Json<canvas::CreateTask>,
) -> Result<(StatusCode, Json<canvas::Task>), AppError> {
    match canvas::add_task(&state.db, &list_id, body)? {
        Some(t) => Ok((StatusCode::CREATED, Json(t))),
        None => Err(AppError::not_found("task list not found")),
    }
}

async fn patch_task_handler(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    Json(body): Json<canvas::PatchTask>,
) -> Result<Json<canvas::Task>, AppError> {
    if canvas::get_task(&state.db, &id)?.is_none() {
        return Err(AppError::not_found("task not found"));
    }
    canvas::update_task(&state.db, &id, body)?
        .map(Json)
        .ok_or_else(|| AppError::not_found("task not found"))
}

async fn delete_task_handler(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if canvas::delete_task(&state.db, &id)? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("task not found"))
    }
}

async fn create_edge_handler(
    State(state): State<ApiState>,
    Path(canvas_id): Path<String>,
    Json(body): Json<canvas::CreateEdge>,
) -> Result<(StatusCode, Json<canvas::Edge>), AppError> {
    match canvas::create_edge(&state.db, &canvas_id, body)? {
        Some(e) => Ok((StatusCode::CREATED, Json(e))),
        None => Err(AppError::not_found("canvas not found")),
    }
}

async fn delete_edge_handler(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if canvas::delete_edge(&state.db, &id)? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("edge not found"))
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateAgent {
    pub project_id: String,
    pub node_id: String,
    pub cwd: Option<String>,
    pub initial_command: Option<String>,
}

async fn create_agent(
    State(state): State<ApiState>,
    Json(body): Json<CreateAgent>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    if project::get(&state.db, &body.project_id)?.is_none() {
        return Err(AppError::not_found("project not found"));
    }
    if canvas::get_node(&state.db, &body.node_id)?.is_none() {
        return Err(AppError::not_found("node not found"));
    }
    let cwd = body.cwd.map(std::path::PathBuf::from);
    let id = state.pty.spawn(cwd)?;
    if let Some(cmd) = body.initial_command.as_deref() {
        let cmd = cmd.trim();
        if !cmd.is_empty() {
            if let Some(sess) = state.pty.get(id) {
                let line = format!("{cmd}\n");
                // Ignore write errors; the terminal will show the issue.
                let _ = sess.write(line.as_bytes()).await;
            }
        }
    }
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "agent_id": id.to_string() })),
    ))
}

async fn pick_directory() -> Result<Response, AppError> {
    let os = std::env::consts::OS;
    let result = tokio::task::spawn_blocking(move || -> anyhow::Result<Option<String>> {
        let out = match os {
            "macos" => std::process::Command::new("osascript")
                .args([
                    "-e",
                    "POSIX path of (choose folder with prompt \"Choose a dazero project folder\")",
                ])
                .output()?,
            "linux" => std::process::Command::new("zenity")
                .args([
                    "--file-selection",
                    "--directory",
                    "--title=Choose a dazero project folder",
                ])
                .output()?,
            _ => return Ok(None),
        };
        if !out.status.success() {
            return Ok(None);
        }
        let s = String::from_utf8_lossy(&out.stdout)
            .trim()
            .trim_end_matches('/')
            .to_string();
        if s.is_empty() {
            Ok(None)
        } else {
            Ok(Some(s))
        }
    })
    .await??;

    match (std::env::consts::OS, result) {
        (_, Some(path)) => {
            Ok((StatusCode::OK, Json(serde_json::json!({ "path": path }))).into_response())
        }
        ("windows", None) => Err(AppError {
            err: anyhow::anyhow!("native folder picker not supported on Windows yet"),
            status: StatusCode::NOT_IMPLEMENTED,
            code: "not_implemented",
        }),
        (_, None) => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

async fn delete_agent(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let uuid = uuid::Uuid::parse_str(&id).map_err(|_| AppError::bad_request("invalid agent id"))?;
    if state.pty.get(uuid).is_none() {
        return Err(AppError::not_found("agent not found"));
    }
    state.pty.remove(uuid);
    Ok(StatusCode::NO_CONTENT)
}

pub struct AppError {
    pub err: anyhow::Error,
    pub status: StatusCode,
    pub code: &'static str,
}

impl AppError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self {
            err: anyhow::anyhow!("{}", msg.into()),
            status: StatusCode::NOT_FOUND,
            code: "not_found",
        }
    }

    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self {
            err: anyhow::anyhow!("{}", msg.into()),
            status: StatusCode::BAD_REQUEST,
            code: "bad_request",
        }
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self {
            err: anyhow::anyhow!("{}", msg.into()),
            status: StatusCode::CONFLICT,
            code: "conflict",
        }
    }
}

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        Self {
            err: e.into(),
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "internal_error",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(serde_json::json!({"error": self.err.to_string(), "code": self.code})),
        )
            .into_response()
    }
}
