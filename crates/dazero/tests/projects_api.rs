// tests/projects_api.rs
use std::time::Duration;
use tokio::net::TcpStream;

#[tokio::test]
async fn create_project_folder_mode() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let tmp_proj = tempfile::TempDir::new().unwrap();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "mode": "folder",
        "path": tmp_proj.path().to_str().unwrap(),
        "name": "myproj"
    });
    let resp = client
        .post(format!("http://{addr}/api/projects"))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201);
    let j: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(j["name"], "myproj");
    assert!(j["path"].as_str().is_some());
    assert!(j["canvas_id"].is_string(), "must auto-create canvas");
}

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
