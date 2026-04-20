use crate::canvas;
use crate::db::Db;
use crate::project;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;

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
    pub pty: std::sync::Arc<crate::pty::PtyRegistry>,
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
        .route("/api/agents", post(create_agent))
        .route("/api/agents/{id}", axum::routing::delete(delete_agent))
        .route("/ws/pty/{id}", get(crate::ws::pty_by_id_handler))
        .with_state(state)
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
            project::create_from_clone(&state.db, &git_url, name)?
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

#[derive(Debug, Deserialize)]
pub struct CreateAgent {
    pub project_id: String,
    pub node_id: String,
    pub cwd: Option<String>,
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
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "agent_id": id.to_string() })),
    ))
}

async fn delete_agent(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let uuid = uuid::Uuid::parse_str(&id).map_err(|_| AppError::not_found("agent not found"))?;
    if state.pty.get(uuid).is_none() {
        return Err(AppError::not_found("agent not found"));
    }
    state.pty.remove(uuid);
    Ok(StatusCode::NO_CONTENT)
}

pub struct AppError {
    pub err: anyhow::Error,
    pub status: StatusCode,
}

impl AppError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self {
            err: anyhow::anyhow!("{}", msg.into()),
            status: StatusCode::NOT_FOUND,
        }
    }
}

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        Self {
            err: e.into(),
            status: StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(serde_json::json!({"error": self.err.to_string()})),
        )
            .into_response()
    }
}
