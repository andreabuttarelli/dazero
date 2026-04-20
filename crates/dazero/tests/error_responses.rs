use std::time::Duration;
use tokio::net::TcpStream;

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
async fn not_found_returns_json_with_code() {
    let (addr, _tmp) = spawn().await;
    let r = reqwest::Client::new()
        .get(format!("http://{addr}/api/projects/does-not-exist"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
    let j: serde_json::Value = r.json().await.unwrap();
    assert_eq!(j["code"], "not_found");
    assert!(j["error"].is_string());
}

#[tokio::test]
async fn invalid_uuid_returns_bad_request() {
    // DELETE on an agent with an invalid UUID today returns 404 ("agent not found")
    // — but conceptually it's a malformed request. Reclassify as 400 "bad_request".
    let (addr, _tmp) = spawn().await;
    let r = reqwest::Client::new()
        .delete(format!("http://{addr}/api/agents/not-a-uuid"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let j: serde_json::Value = r.json().await.unwrap();
    assert_eq!(j["code"], "bad_request");
}

#[tokio::test]
async fn clone_to_existing_dir_returns_409() {
    let (addr, _tmp) = spawn().await;
    // Set DAZERO_PROJECTS_DIR to a temp so we don't pollute ~/.dazero
    let proj_root = tempfile::TempDir::new().unwrap();
    unsafe {
        std::env::set_var("DAZERO_PROJECTS_DIR", proj_root.path());
    }

    // Make a bare repo to clone from
    let (_bare, url) = make_bare_remote_with_commit();

    // First clone — should succeed (201)
    let client = reqwest::Client::new();
    let r1 = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"clone","git_url":url.clone(),"name":"dup"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r1.status(), 201);

    // Second clone to the same name — should conflict (409)
    let r2 = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"clone","git_url":url,"name":"dup"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 409);
    let j: serde_json::Value = r2.json().await.unwrap();
    assert_eq!(j["code"], "conflict");

    std::mem::forget(proj_root);
}

fn make_bare_remote_with_commit() -> (tempfile::TempDir, String) {
    use std::process::Command;
    let seed = tempfile::TempDir::new().unwrap();
    let sp = seed.path();
    let run = |args: &[&str]| {
        let s = Command::new("git")
            .current_dir(sp)
            .args(args)
            .status()
            .unwrap();
        assert!(s.success(), "git {args:?} failed");
    };
    run(&["init", "-q", "--initial-branch=main", "."]);
    run(&["config", "user.email", "t@d.local"]);
    run(&["config", "user.name", "T"]);
    std::fs::write(sp.join("README.md"), "x\n").unwrap();
    run(&["add", "."]);
    run(&["commit", "-q", "-m", "i"]);

    let bare = tempfile::TempDir::new().unwrap();
    Command::new("git")
        .current_dir(bare.path())
        .args(["init", "-q", "--bare", "."])
        .status()
        .unwrap();
    run(&["remote", "add", "origin", bare.path().to_str().unwrap()]);
    run(&["push", "-q", "origin", "main"]);
    std::mem::forget(seed);
    let url = format!("file://{}", bare.path().display());
    (bare, url)
}
