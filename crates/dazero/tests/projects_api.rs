// tests/projects_api.rs
use std::process::Command;
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

fn make_bare_remote_with_commit() -> (tempfile::TempDir, String) {
    // seed repo with one commit
    let seed = tempfile::TempDir::new().unwrap();
    let seed_path = seed.path();
    run_git(seed_path, &["init", "-q", "--initial-branch=main", "."]);
    run_git(seed_path, &["config", "user.email", "test@dazero.local"]);
    run_git(seed_path, &["config", "user.name", "Dazero Test"]);
    std::fs::write(seed_path.join("README.md"), "# seeded\n").unwrap();
    run_git(seed_path, &["add", "."]);
    run_git(seed_path, &["commit", "-q", "-m", "initial"]);

    // create bare repo
    let bare = tempfile::TempDir::new().unwrap();
    run_git(bare.path(), &["init", "-q", "--bare", "."]);

    // push seed → bare
    run_git(
        seed_path,
        &["remote", "add", "origin", bare.path().to_str().unwrap()],
    );
    run_git(seed_path, &["push", "-q", "origin", "main"]);

    let url = format!("file://{}", bare.path().display());
    // Leak seed to keep temp dir alive (bare is what we return — caller needs it alive during clone)
    std::mem::forget(seed);
    (bare, url)
}

fn run_git(cwd: &std::path::Path, args: &[&str]) {
    let status = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .status()
        .unwrap_or_else(|e| panic!("git {args:?} failed to spawn: {e}"));
    assert!(status.success(), "git {args:?} exited with {status:?}");
}

#[tokio::test]
async fn create_project_clone_mode_from_local_bare() {
    let proj_tmp = tempfile::TempDir::new().unwrap();
    // SAFETY: tokio test is single-threaded by default (no # flavor) so setting env is safe.
    unsafe {
        std::env::set_var("DAZERO_PROJECTS_DIR", proj_tmp.path());
    }

    let (addr, _tmp) = spawn_test_daemon().await;
    let (_bare, url) = make_bare_remote_with_commit();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "mode": "clone",
        "git_url": url,
        "name": "clone-test"
    });
    let resp = client
        .post(format!("http://{addr}/api/projects"))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201, "body: {:?}", resp.text().await);
    let j: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(j["name"], "clone-test");
    assert!(j["canvas_id"].is_string());
    let p = std::path::Path::new(j["path"].as_str().unwrap());
    assert!(p.exists(), "cloned path must exist: {p:?}");
    assert!(p.join(".git").exists(), "must be a git checkout");
    assert!(p.join("README.md").exists(), "seeded file must be present");

    // proj_tmp holds the temp dir alive — it will be cleaned up on drop.
    drop(proj_tmp);
}

#[tokio::test]
async fn list_projects_sorted_by_last_opened() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let client = reqwest::Client::new();

    // Create two projects
    let proj_a = tempfile::TempDir::new().unwrap();
    let proj_b = tempfile::TempDir::new().unwrap();
    let pa: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_a.path(),"name":"A"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await; // ensure distinct timestamps (seconds resolution)
    let pb: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_b.path(),"name":"B"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let list: Vec<serde_json::Value> = client
        .get(format!("http://{addr}/api/projects"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(list.len() >= 2);
    // B must come before A (newer last_opened_at first)
    let names: Vec<&str> = list.iter().map(|p| p["name"].as_str().unwrap()).collect();
    let idx_a = names.iter().position(|n| *n == "A").unwrap();
    let idx_b = names.iter().position(|n| *n == "B").unwrap();
    assert!(idx_b < idx_a, "expected B before A, got {names:?}");
    let _ = pa;
    let _ = pb;
}

#[tokio::test]
async fn get_and_patch_project() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let client = reqwest::Client::new();
    let proj = tempfile::TempDir::new().unwrap();
    let p: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj.path(),"name":"original"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = p["id"].as_str().unwrap();

    // GET
    let got: serde_json::Value = client
        .get(format!("http://{addr}/api/projects/{id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(got["name"], "original");

    // PATCH name
    let patched: serde_json::Value = client
        .patch(format!("http://{addr}/api/projects/{id}"))
        .json(&serde_json::json!({"name":"renamed"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(patched["name"], "renamed");

    // GET 404 for unknown
    let r = client
        .get(format!("http://{addr}/api/projects/does-not-exist"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
}

#[tokio::test]
async fn delete_project_removes_from_list() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let client = reqwest::Client::new();
    let proj = tempfile::TempDir::new().unwrap();
    let p: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj.path(),"name":"doomed"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = p["id"].as_str().unwrap();

    let r = client
        .delete(format!("http://{addr}/api/projects/{id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);

    // Subsequent GET is 404
    let r2 = client
        .get(format!("http://{addr}/api/projects/{id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 404);
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
