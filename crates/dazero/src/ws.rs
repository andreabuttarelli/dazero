use crate::pty::PtySession;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
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
