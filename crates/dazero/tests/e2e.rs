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

/// Exercises the full M2 flow:
/// 1. Create a project (folder mode)
/// 2. Create a terminal node on its canvas
/// 3. Spawn an agent with that project's cwd
/// 4. Connect WS, run `pwd`, verify cwd is echoed
/// 5. Create a task-list node + add 2 tasks, check one as done
/// 6. Patch canvas viewport
/// 7. GET canvas — verify all pieces present (1 terminal node, 1 task-list with 2 tasks, viewport updated)
/// 8. Delete the project — cascades everything; GET canvas returns 404
#[tokio::test]
async fn full_m2_happy_path() {
    let (addr, _tmp) = spawn().await;
    let client = reqwest::Client::new();

    // 1. Create project
    let proj_dir = tempfile::TempDir::new().unwrap();
    let proj: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_dir.path(),"name":"e2e"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_id = proj["id"].as_str().unwrap().to_string();
    let canvas_id = proj["canvas_id"].as_str().unwrap().to_string();
    let project_path = proj["path"].as_str().unwrap().to_string();

    // 2. Create terminal node
    let term_node: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{canvas_id}/nodes"))
        .json(&serde_json::json!({
            "kind": "terminal",
            "position_x": 100.0, "position_y": 100.0,
            "data": {"title": "shell-1"}
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let term_node_id = term_node["id"].as_str().unwrap().to_string();

    // 3. Spawn agent
    let agent: serde_json::Value = client
        .post(format!("http://{addr}/api/agents"))
        .json(&serde_json::json!({
            "project_id": project_id,
            "node_id": term_node_id,
            "cwd": project_path
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let agent_id = agent["agent_id"].as_str().unwrap().to_string();

    // 4. WS pwd round-trip
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
                    if String::from_utf8_lossy(&out).contains(&project_path) { break; }
                }
                _ => break,
            }
        }
    }
    assert!(
        String::from_utf8_lossy(&out).contains(&project_path),
        "expected cwd in PTY output. got: {:?}",
        String::from_utf8_lossy(&out)
    );

    // 5. Task-list node + tasks
    let tl_node: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{canvas_id}/nodes"))
        .json(&serde_json::json!({
            "kind": "task_list",
            "position_x": 400.0, "position_y": 100.0,
            "data": {"title": "e2e todos"}
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    // Find the auto-created task_list id via GET canvas
    let c_partial: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let tl_id = c_partial["task_lists"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let t1: serde_json::Value = client
        .post(format!("http://{addr}/api/task-lists/{tl_id}/tasks"))
        .json(&serde_json::json!({"description":"do the thing"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let _t2: serde_json::Value = client
        .post(format!("http://{addr}/api/task-lists/{tl_id}/tasks"))
        .json(&serde_json::json!({"description":"do the other thing"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    // Check first task as done
    client
        .patch(format!(
            "http://{addr}/api/tasks/{}",
            t1["id"].as_str().unwrap()
        ))
        .json(&serde_json::json!({"status":"done"}))
        .send()
        .await
        .unwrap();

    // 6. Viewport
    let r_vp = client
        .patch(format!("http://{addr}/api/canvases/{canvas_id}/viewport"))
        .json(&serde_json::json!({"x":42.5,"y":-17.0,"zoom":2.25}))
        .send()
        .await
        .unwrap();
    assert_eq!(r_vp.status(), 204);

    // 7. Full GET — everything coherent
    let c: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c["viewport"]["x"], 42.5);
    assert_eq!(c["viewport"]["y"], -17.0);
    assert_eq!(c["viewport"]["zoom"], 2.25);
    assert_eq!(c["nodes"].as_array().unwrap().len(), 2); // terminal + task_list
    assert_eq!(c["task_lists"].as_array().unwrap().len(), 1);
    let tasks = c["task_lists"][0]["tasks"].as_array().unwrap();
    assert_eq!(tasks.len(), 2);
    let done_count = tasks.iter().filter(|t| t["status"] == "done").count();
    assert_eq!(done_count, 1);

    let _ = tl_node;

    // 8. Delete project — cascade
    let r_del = client
        .delete(format!("http://{addr}/api/projects/{project_id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r_del.status(), 204);

    let r_after = client
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r_after.status(), 404);
    let body: serde_json::Value = r_after.json().await.unwrap();
    assert_eq!(body["code"], "not_found");

    std::mem::forget(proj_dir);
}
