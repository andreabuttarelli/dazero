use std::time::Duration;
use tokio::net::TcpStream;

async fn spawn_test_daemon() -> (std::net::SocketAddr, tempfile::TempDir) {
    let tmp = tempfile::TempDir::new().unwrap();
    let db_path = tmp.path().join("test.db");
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let path_clone = db_path.clone();
    tokio::spawn(async move {
        dazero::http::serve_with_db(port, path_clone).await.unwrap();
    });
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    (([127, 0, 0, 1], port).into(), tmp)
}

async fn create_project(addr: std::net::SocketAddr) -> serde_json::Value {
    let proj = tempfile::TempDir::new().unwrap();
    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj.path(),"name":"canvas-test"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    std::mem::forget(proj); // keep alive for test duration
    v
}

#[tokio::test]
async fn get_canvas_returns_defaults_and_empty_children() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let proj = create_project(addr).await;
    let canvas_id = proj["canvas_id"].as_str().unwrap();

    let c: serde_json::Value = reqwest::Client::new()
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c["id"], canvas_id);
    assert_eq!(c["project_id"], proj["id"]);
    assert_eq!(c["viewport"]["x"], 0.0);
    assert_eq!(c["viewport"]["y"], 0.0);
    assert_eq!(c["viewport"]["zoom"], 1.0);
    assert!(c["nodes"].is_array());
    assert_eq!(c["nodes"].as_array().unwrap().len(), 0);
    assert!(c["task_lists"].is_array());
    assert_eq!(c["task_lists"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn patch_viewport_persists() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let proj = create_project(addr).await;
    let canvas_id = proj["canvas_id"].as_str().unwrap();

    let r = reqwest::Client::new()
        .patch(format!("http://{addr}/api/canvases/{canvas_id}/viewport"))
        .json(&serde_json::json!({"x":100.5,"y":-50.25,"zoom":1.5}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);

    let c: serde_json::Value = reqwest::Client::new()
        .get(format!("http://{addr}/api/canvases/{canvas_id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c["viewport"]["x"], 100.5);
    assert_eq!(c["viewport"]["y"], -50.25);
    assert_eq!(c["viewport"]["zoom"], 1.5);
}

#[tokio::test]
async fn get_canvas_404_for_unknown_id() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let r = reqwest::Client::new()
        .get(format!("http://{addr}/api/canvases/does-not-exist"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}
