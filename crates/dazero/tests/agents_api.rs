use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};

async fn spawn() -> (std::net::SocketAddr, tempfile::TempDir) {
    let tmp = tempfile::TempDir::new().unwrap();
    let db = tmp.path().join("test.db");
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let p = db.clone();
    tokio::spawn(async move {
        dazero::http::serve_with_db(port, p).await.unwrap();
    });
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    (([127, 0, 0, 1], port).into(), tmp)
}

#[tokio::test]
async fn spawn_agent_then_ws_executes_shell_in_cwd() {
    let (addr, _tmp) = spawn().await;
    let client = reqwest::Client::new();

    // Create project, node
    let proj_dir = tempfile::TempDir::new().unwrap();
    let proj: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_dir.path(),"name":"p"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let canvas_id = proj["canvas_id"].as_str().unwrap();
    let node: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{canvas_id}/nodes"))
        .json(&serde_json::json!({"kind":"terminal","position_x":0.0,"position_y":0.0,"data":{}}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    // Spawn agent
    let r = client
        .post(format!("http://{addr}/api/agents"))
        .json(&serde_json::json!({
            "project_id": proj["id"],
            "node_id": node["id"],
            "cwd": proj["path"]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 201);
    let a: serde_json::Value = r.json().await.unwrap();
    let agent_id = a["agent_id"].as_str().unwrap().to_string();

    // Connect WS to /ws/pty/{id}, execute pwd, expect project path in output
    let ws_url = format!("ws://{addr}/ws/pty/{agent_id}");
    let (mut ws, _) = connect_async(ws_url).await.unwrap();
    ws.send(Message::Binary("pwd\n".into())).await.unwrap();

    let mut out = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            msg = ws.next() => match msg {
                Some(Ok(Message::Binary(b))) => {
                    out.extend_from_slice(&b);
                    if String::from_utf8_lossy(&out).contains(proj["path"].as_str().unwrap()) { break; }
                }
                _ => break,
            }
        }
    }
    assert!(
        String::from_utf8_lossy(&out).contains(proj["path"].as_str().unwrap()),
        "expected cwd in output. got: {:?}",
        String::from_utf8_lossy(&out)
    );
    std::mem::forget(proj_dir);
}

#[tokio::test]
async fn ws_pty_unknown_id_rejected() {
    let (addr, _tmp) = spawn().await;
    let url = format!("ws://{addr}/ws/pty/not-a-real-uuid-12345");
    let res = connect_async(url).await;
    assert!(res.is_err(), "expected handshake to fail for unknown id");
}
