use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;

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
