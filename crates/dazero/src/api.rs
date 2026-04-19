use crate::db::Db;
use crate::project;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
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
}

pub fn routes(state: ApiState) -> Router {
    Router::new()
        .route("/api/projects", post(create_project).get(list_projects))
        .route(
            "/api/projects/{id}",
            get(get_project).patch(patch_project).delete(delete_project),
        )
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
