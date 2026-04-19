use crate::db::Db;
use crate::project;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json, Router};
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
        .route("/api/projects", axum::routing::post(create_project))
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

pub struct AppError(pub anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        AppError(e.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": self.0.to_string()})),
        )
            .into_response()
    }
}
