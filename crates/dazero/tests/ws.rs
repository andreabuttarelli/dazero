use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn ws_echo_roundtrip() {
    let port = find_free_port();
    tokio::spawn(async move { dazero::http::serve(port).await.unwrap() });

    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let url = format!("ws://127.0.0.1:{port}/ws/echo");
    let (mut ws, _) = connect_async(url).await.expect("connect failed");
    ws.send(Message::Text("hello".into())).await.unwrap();
    let msg = ws.next().await.unwrap().unwrap();
    assert_eq!(msg.to_text().unwrap(), "hello");
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
