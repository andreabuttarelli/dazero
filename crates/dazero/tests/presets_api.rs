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

/// Spawn a daemon with an isolated config path so tests don't share config.
/// Returns (addr, tmp_dir, config_path). Uses serve_with_db_and_config to avoid
/// env-var races when tests run in parallel.
async fn spawn_test_daemon_fresh() -> (std::net::SocketAddr, tempfile::TempDir, std::path::PathBuf)
{
    let tmp = tempfile::TempDir::new().unwrap();
    let db_path = tmp.path().join("test.db");
    let config_path = tmp.path().join("agents.toml");
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let path_clone = db_path.clone();
    let config_clone = config_path.clone();
    tokio::spawn(async move {
        dazero::http::serve_with_db_and_config(port, path_clone, config_clone)
            .await
            .unwrap();
    });
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    (([127, 0, 0, 1], port).into(), tmp, config_path)
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

#[tokio::test]
async fn create_user_preset_persists_to_toml() {
    let (addr, _db_tmp, config_path) = spawn_test_daemon_fresh().await;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "key": "aider-local",
        "label": "Aider (local)",
        "initial_command": "aider --model ollama/llama3.1",
        "accent": "#8ae68a"
    });
    let r = client
        .post(format!("http://{addr}/api/agent-presets"))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 201);

    // GET returns it
    let j: serde_json::Value = client
        .get(format!("http://{addr}/api/agent-presets"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let keys: Vec<&str> = j["presets"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| p["key"].as_str())
        .collect();
    assert!(keys.contains(&"aider-local"));

    // File exists and contains the preset key
    assert!(config_path.exists(), "toml file should have been written");
    let content = std::fs::read_to_string(&config_path).unwrap();
    assert!(
        content.contains("aider-local"),
        "toml should mention the new preset"
    );
}

#[tokio::test]
async fn delete_pure_user_preset_returns_204() {
    let (addr, _db_tmp, _config_path) = spawn_test_daemon_fresh().await;
    let client = reqwest::Client::new();

    client
        .post(format!("http://{addr}/api/agent-presets"))
        .json(&serde_json::json!({"key":"foo","label":"Foo","accent":"#f00"}))
        .send()
        .await
        .unwrap();

    let r = client
        .delete(format!("http://{addr}/api/agent-presets/foo"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);

    let r2 = client
        .delete(format!("http://{addr}/api/agent-presets/foo"))
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 404);
}

#[tokio::test]
async fn delete_builtin_without_override_is_404() {
    let (addr, _db_tmp, _config_path) = spawn_test_daemon_fresh().await;
    let r = reqwest::Client::new()
        .delete(format!("http://{addr}/api/agent-presets/shell"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}
