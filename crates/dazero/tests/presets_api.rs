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

#[tokio::test]
async fn get_agent_presets_returns_builtins() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let r = reqwest::get(format!("http://{addr}/api/agent-presets"))
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let j: serde_json::Value = r.json().await.unwrap();
    assert_eq!(j["max_concurrent_agents"], 5);
    let names: Vec<&str> = j["presets"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| p["key"].as_str())
        .collect();
    assert!(names.contains(&"shell"));
    assert!(names.contains(&"claude-code"));
}
