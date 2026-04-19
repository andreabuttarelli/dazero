use crate::ui_assets::Assets;
use crate::ws;
use anyhow::Result;
use axum::{
    body::Body,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing::info;

pub async fn serve(port: u16) -> Result<()> {
    let app = Router::new()
        .route("/health", get(health))
        .route("/ws/echo", get(ws::echo_handler))
        .route("/ws/pty", get(ws::pty_handler))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!(%addr, "dazero listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "version": env!("CARGO_PKG_VERSION") }))
}

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path).or_else(|| Assets::get("index.html")) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(file.data.into_owned()))
                .unwrap()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}
