use crate::pty::PtySession;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;

pub async fn echo_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(echo_socket)
}

async fn echo_socket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.recv().await {
        let reply = match msg {
            Message::Text(_) | Message::Binary(_) => Some(msg),
            Message::Close(_) => break,
            _ => None,
        };
        if let Some(m) = reply {
            if socket.send(m).await.is_err() {
                break;
            }
        }
    }
}

pub async fn pty_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(pty_socket)
}

async fn pty_socket(socket: WebSocket) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    let sess = match PtySession::spawn_shell(None) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            let _ = ws_tx
                .send(Message::Text(format!("pty spawn failed: {e}").into()))
                .await;
            return;
        }
    };

    // Task: PTY → WebSocket
    let reader_sess = sess.clone();
    let reader = tokio::spawn(async move {
        while let Ok(chunk) = reader_sess.read_some().await {
            if ws_tx.send(Message::Binary(chunk.into())).await.is_err() {
                break;
            }
        }
    });

    // Main: WebSocket → PTY
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Binary(b) if sess.write(&b).await.is_err() => break,
            Message::Text(t) if sess.write(t.as_bytes()).await.is_err() => break,
            Message::Close(_) => break,
            _ => {}
        }
    }

    reader.abort();
}

/// Per-session WebSocket handler for `/ws/pty/{id}`.
/// Returns 404 before upgrade if the UUID is invalid or the session is unknown.
pub async fn pty_by_id_handler(
    State(state): State<crate::api::ApiState>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let uuid = match uuid::Uuid::parse_str(&id) {
        Ok(u) => u,
        Err(_) => return (StatusCode::NOT_FOUND, "bad uuid").into_response(),
    };
    let Some(sess) = state.pty.get(uuid) else {
        return (StatusCode::NOT_FOUND, "agent not found").into_response();
    };
    ws.on_upgrade(move |socket| pty_socket_with_session(socket, sess))
}

async fn pty_socket_with_session(socket: WebSocket, sess: Arc<PtySession>) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    let reader_sess = sess.clone();
    let reader = tokio::spawn(async move {
        while let Ok(chunk) = reader_sess.read_some().await {
            if ws_tx.send(Message::Binary(chunk.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Binary(b) => {
                if sess.write(&b).await.is_err() {
                    break;
                }
            }
            Message::Text(t) => {
                // Detect a JSON control frame like {"type":"resize","cols":120,"rows":40}.
                // Anything else is forwarded to the PTY verbatim.
                if let Some(bytes) = handle_control_frame(&sess, &t).await {
                    if sess.write(bytes).await.is_err() {
                        break;
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    reader.abort();
}

/// If `text` is a JSON control frame, act on it and return None (consumed).
/// Otherwise return Some(bytes_to_forward) for the normal PTY write path.
async fn handle_control_frame<'a>(sess: &Arc<PtySession>, text: &'a str) -> Option<&'a [u8]> {
    let trimmed = text.trim_start();
    if !trimmed.starts_with('{') {
        return Some(text.as_bytes());
    }
    let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return Some(text.as_bytes());
    };
    match val.get("type").and_then(|v| v.as_str()) {
        Some("resize") => {
            let cols = val.get("cols").and_then(|v| v.as_u64()).unwrap_or(80);
            let rows = val.get("rows").and_then(|v| v.as_u64()).unwrap_or(24);
            let _ = sess.resize(cols as u16, rows as u16);
            None
        }
        _ => Some(text.as_bytes()),
    }
}
