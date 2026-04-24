use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

async fn wait_port(port: u16) {
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("port {port} never came up");
}

async fn drain_until(
    ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    marker: &str,
    timeout_ms: u64,
) -> Vec<u8> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
    let mut buf = Vec::new();
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            msg = ws.next() => match msg {
                Some(Ok(Message::Binary(b))) => {
                    buf.extend_from_slice(&b);
                    if String::from_utf8_lossy(&buf).contains(marker) { break; }
                }
                _ => break,
            }
        }
    }
    buf
}

#[tokio::test]
async fn daemon_restart_preserves_agent_session() {
    let tmp = tempfile::TempDir::new().unwrap();
    let db = tmp.path().join("dazero.db");
    let cfg = tmp.path().join("agents.toml");

    // === Daemon 1 ===
    let port1 = find_free_port();
    let db1 = db.clone();
    let cfg1 = cfg.clone();
    let daemon1 = tokio::spawn(async move {
        dazero::http::serve_with_db_and_config(port1, db1, cfg1)
            .await
            .unwrap();
    });
    wait_port(port1).await;

    let client = reqwest::Client::new();
    let proj_dir = tempfile::TempDir::new().unwrap();
    let proj: serde_json::Value = client
        .post(format!("http://127.0.0.1:{port1}/api/projects"))
        .json(&serde_json::json!({
            "mode": "folder",
            "path": proj_dir.path(),
            "name": "restart"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let cid = proj["canvas_id"].as_str().unwrap().to_string();
    let pid = proj["id"].as_str().unwrap().to_string();

    let node: serde_json::Value = client
        .post(format!("http://127.0.0.1:{port1}/api/canvases/{cid}/nodes"))
        .json(&serde_json::json!({
            "kind": "terminal",
            "position_x": 0,
            "position_y": 0,
            "data": {}
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let nid = node["id"].as_str().unwrap().to_string();

    let agent: serde_json::Value = client
        .post(format!("http://127.0.0.1:{port1}/api/agents"))
        .json(&serde_json::json!({
            "project_id": pid,
            "node_id": nid,
            "cwd": proj["path"]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let aid = agent["agent_id"].as_str().unwrap().to_string();

    // Send a command via WS and confirm it is echoed
    let (mut ws1, _) = connect_async(format!("ws://127.0.0.1:{port1}/ws/pty/{aid}"))
        .await
        .unwrap();
    ws1.send(Message::Binary("echo persistence-ok\n".into()))
        .await
        .unwrap();
    let out1 = drain_until(&mut ws1, "persistence-ok", 5000).await;
    assert!(
        String::from_utf8_lossy(&out1).contains("persistence-ok"),
        "daemon1 should echo 'persistence-ok'. got: {:?}",
        String::from_utf8_lossy(&out1)
    );
    let _ = ws1.close(None).await;

    // === Kill daemon1 but LEAVE tmux sessions alive ===
    daemon1.abort();
    tokio::time::sleep(Duration::from_millis(300)).await;

    // === Daemon 2: different port, SAME db + cfg ===
    // recover() is called automatically inside serve_with_db_and_config
    let port2 = find_free_port();
    let db2 = db.clone();
    let cfg2 = cfg.clone();
    let daemon2 = tokio::spawn(async move {
        dazero::http::serve_with_db_and_config(port2, db2, cfg2)
            .await
            .unwrap();
    });
    wait_port(port2).await;

    // Reconnect WS to the same agent id on daemon2
    let (mut ws2, _) = connect_async(format!("ws://127.0.0.1:{port2}/ws/pty/{aid}"))
        .await
        .unwrap();
    ws2.send(Message::Binary("echo still-here\n".into()))
        .await
        .unwrap();
    let out2 = drain_until(&mut ws2, "still-here", 5000).await;
    assert!(
        String::from_utf8_lossy(&out2).contains("still-here"),
        "daemon2 should echo 'still-here' via recovered tmux session. got: {:?}",
        String::from_utf8_lossy(&out2)
    );

    // Cleanup: kill the agent (tmux session) via daemon2, then stop daemon2
    let _ = client
        .delete(format!("http://127.0.0.1:{port2}/api/agents/{aid}"))
        .send()
        .await;
    daemon2.abort();

    // Keep proj_dir alive until after cleanup so the path remains valid during the test
    std::mem::forget(proj_dir);
}
