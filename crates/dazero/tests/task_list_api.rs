use std::time::Duration;
use tokio::net::TcpStream;

async fn spawn() -> (std::net::SocketAddr, tempfile::TempDir) {
    let tmp = tempfile::TempDir::new().unwrap();
    let db_path = tmp.path().join("test.db");
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let p = db_path.clone();
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

async fn setup_task_list(addr: std::net::SocketAddr) -> (String, String) {
    let proj_dir = tempfile::TempDir::new().unwrap();
    let client = reqwest::Client::new();
    let proj: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_dir.path(),"name":"t"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    std::mem::forget(proj_dir);
    let canvas_id = proj["canvas_id"].as_str().unwrap().to_string();
    let _node: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{canvas_id}/nodes"))
        .json(&serde_json::json!({
            "kind":"task_list","position_x":0.0,"position_y":0.0,
            "data": {"title":"my todo"}
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    // Find the auto-created task_list id via GET canvas
    let c: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let tl_id = c["task_lists"][0]["id"].as_str().unwrap().to_string();
    (canvas_id, tl_id)
}

#[tokio::test]
async fn task_list_auto_created_on_task_list_node() {
    let (addr, _tmp) = spawn().await;
    let (canvas_id, _tl_id) = setup_task_list(addr).await;
    let c: serde_json::Value = reqwest::get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c["task_lists"].as_array().unwrap().len(), 1);
    assert_eq!(c["task_lists"][0]["title"], "my todo");
    assert_eq!(c["task_lists"][0]["tasks"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn add_patch_delete_task_flow() {
    let (addr, _tmp) = spawn().await;
    let (canvas_id, tl_id) = setup_task_list(addr).await;
    let client = reqwest::Client::new();

    // Add 3 tasks
    let t1: serde_json::Value = client
        .post(format!("http://{addr}/api/task-lists/{tl_id}/tasks"))
        .json(&serde_json::json!({"description":"first"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(t1["description"], "first");
    assert_eq!(t1["status"], "pending");
    assert_eq!(t1["position"], 0);

    let t2: serde_json::Value = client
        .post(format!("http://{addr}/api/task-lists/{tl_id}/tasks"))
        .json(&serde_json::json!({"description":"second"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(t2["position"], 1);

    client
        .post(format!("http://{addr}/api/task-lists/{tl_id}/tasks"))
        .json(&serde_json::json!({"description":"third"}))
        .send()
        .await
        .unwrap();

    // GET canvas — 3 tasks in order
    let c: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let tasks = c["task_lists"][0]["tasks"].as_array().unwrap();
    assert_eq!(tasks.len(), 3);
    assert_eq!(tasks[0]["description"], "first");
    assert_eq!(tasks[1]["description"], "second");
    assert_eq!(tasks[2]["description"], "third");

    // Toggle middle to done
    let t2_id = t2["id"].as_str().unwrap();
    let patched: serde_json::Value = client
        .patch(format!("http://{addr}/api/tasks/{t2_id}"))
        .json(&serde_json::json!({"status":"done"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(patched["status"], "done");

    // Delete first
    let t1_id = t1["id"].as_str().unwrap();
    let r = client
        .delete(format!("http://{addr}/api/tasks/{t1_id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);

    // Verify: only 2 tasks left, the middle one is 'done'
    let c2: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let tasks2 = c2["task_lists"][0]["tasks"].as_array().unwrap();
    assert_eq!(tasks2.len(), 2);
    let done_count = tasks2.iter().filter(|t| t["status"] == "done").count();
    assert_eq!(done_count, 1);
}

#[tokio::test]
async fn patch_unknown_task_returns_404() {
    let (addr, _tmp) = spawn().await;
    let r = reqwest::Client::new()
        .patch(format!("http://{addr}/api/tasks/does-not-exist"))
        .json(&serde_json::json!({"status":"done"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}

#[tokio::test]
async fn add_task_to_unknown_list_returns_404() {
    let (addr, _tmp) = spawn().await;
    let r = reqwest::Client::new()
        .post(format!("http://{addr}/api/task-lists/bogus/tasks"))
        .json(&serde_json::json!({"description":"x"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}
