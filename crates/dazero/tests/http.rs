// crates/dazero/tests/http.rs
use std::time::Duration;
use tokio::net::TcpStream;

#[tokio::test]
async fn health_endpoint_responds_ok() {
    // Avvia server in un task separato su porta random
    let port = find_free_port();
    let handle = tokio::spawn(async move {
        dazero::http::serve(port).await.unwrap();
    });

    // Attendi che il server sia up (max 3s)
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let url = format!("http://127.0.0.1:{port}/health");
    let resp = reqwest::get(&url).await.expect("request failed");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));

    handle.abort();
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
