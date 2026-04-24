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

#[tokio::test]
async fn delete_agent_removes_from_registry() {
    let (addr, _tmp) = spawn().await;
    let client = reqwest::Client::new();

    // Minimal setup: project + node
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
    std::mem::forget(proj_dir);

    // Spawn
    let a: serde_json::Value = client
        .post(format!("http://{addr}/api/agents"))
        .json(&serde_json::json!({
            "project_id": proj["id"], "node_id": node["id"], "cwd": proj["path"]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let agent_id = a["agent_id"].as_str().unwrap();

    // DELETE → 204
    let r = client
        .delete(format!("http://{addr}/api/agents/{agent_id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);

    // Subsequent WS connect must fail (handshake rejected with 404)
    let res = tokio_tungstenite::connect_async(format!("ws://{addr}/ws/pty/{agent_id}")).await;
    assert!(res.is_err(), "expected WS handshake rejection after delete");
}

#[tokio::test]
async fn delete_unknown_agent_returns_404() {
    let (addr, _tmp) = spawn().await;
    // A well-formed UUID that doesn't exist in the registry → 404
    let unknown_uuid = uuid::Uuid::new_v4().to_string();
    let r = reqwest::Client::new()
        .delete(format!("http://{addr}/api/agents/{unknown_uuid}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}

#[tokio::test]
async fn initial_command_executes_in_pty() {
    let (addr, _tmp) = spawn().await;
    let client = reqwest::Client::new();

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

    let a: serde_json::Value = client
        .post(format!("http://{addr}/api/agents"))
        .json(&serde_json::json!({
            "project_id": proj["id"],
            "node_id": node["id"],
            "cwd": proj["path"],
            "initial_command": "echo dazero-init-ok"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let agent_id = a["agent_id"].as_str().unwrap();

    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws/pty/{agent_id}"))
        .await
        .unwrap();
    let mut out = Vec::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        use futures_util::StreamExt;
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            msg = ws.next() => match msg {
                Some(Ok(tokio_tungstenite::tungstenite::Message::Binary(b))) => {
                    out.extend_from_slice(&b);
                    if String::from_utf8_lossy(&out).contains("dazero-init-ok") { break; }
                }
                _ => break,
            }
        }
    }
    assert!(
        String::from_utf8_lossy(&out).contains("dazero-init-ok"),
        "expected initial command output, got {:?}",
        String::from_utf8_lossy(&out)
    );
    std::mem::forget(proj_dir);
}

#[tokio::test]
async fn budget_cap_returns_429() {
    // Boot a daemon with max=2 via a custom config file
    let tmp = tempfile::TempDir::new().unwrap();
    let db_path = tmp.path().join("test.db");
    let cfg_path = tmp.path().join("agents.toml");
    std::fs::write(&cfg_path, "max_concurrent_agents = 2\n").unwrap();

    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let p1 = db_path.clone();
    let p2 = cfg_path.clone();
    tokio::spawn(async move {
        dazero::http::serve_with_db_and_config(port, p1, p2)
            .await
            .unwrap();
    });
    for _ in 0..30 {
        if tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
        {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    let client = reqwest::Client::new();
    // Create project + 3 terminal nodes
    let proj_dir = tempfile::TempDir::new().unwrap();
    let proj: serde_json::Value = client
        .post(format!("http://127.0.0.1:{port}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_dir.path(),"name":"cap"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    std::mem::forget(proj_dir);
    let pid = proj["id"].as_str().unwrap().to_string();
    let cid = proj["canvas_id"].as_str().unwrap().to_string();

    let mut node_ids = vec![];
    for _ in 0..3 {
        let n: serde_json::Value = client
            .post(format!("http://127.0.0.1:{port}/api/canvases/{cid}/nodes"))
            .json(&serde_json::json!({"kind":"terminal","position_x":0,"position_y":0,"data":{}}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        node_ids.push(n["id"].as_str().unwrap().to_string());
    }

    // Spawn 2 agents — both 201
    for (i, nid) in node_ids.iter().enumerate().take(2) {
        let r = client
            .post(format!("http://127.0.0.1:{port}/api/agents"))
            .json(&serde_json::json!({"project_id":pid,"node_id":nid,"cwd":proj["path"]}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 201, "agent {i} should spawn");
    }

    // 3rd is refused with 429
    let r = client
        .post(format!("http://127.0.0.1:{port}/api/agents"))
        .json(&serde_json::json!({"project_id":pid,"node_id":node_ids[2],"cwd":proj["path"]}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 429);
    let body: serde_json::Value = r.json().await.unwrap();
    assert_eq!(body["code"], "budget_exceeded");
}
