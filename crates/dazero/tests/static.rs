use std::time::Duration;
use tokio::net::TcpStream;

#[tokio::test]
async fn root_serves_index_html() {
    let port = find_free_port();
    tokio::spawn(async move {
        dazero::http::serve(port).await.unwrap();
    });

    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let resp = reqwest::get(format!("http://127.0.0.1:{port}/"))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    assert!(
        body.contains("<div id=\"root\">"),
        "expected React root in body"
    );
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
