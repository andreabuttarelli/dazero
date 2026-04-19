use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn ws_pty_shell_echo() {
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

    let url = format!("ws://127.0.0.1:{port}/ws/pty");
    let (mut ws, _) = connect_async(url).await.expect("connect");

    // Invia un comando alla shell
    ws.send(Message::Binary("echo pty-hello\n".into()))
        .await
        .unwrap();

    let mut received = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            msg = ws.next() => {
                match msg {
                    Some(Ok(Message::Binary(b))) => {
                        received.extend_from_slice(&b);
                        if String::from_utf8_lossy(&received).contains("pty-hello") { break; }
                    }
                    Some(Ok(_)) => {}
                    _ => break,
                }
            }
        }
    }
    assert!(
        String::from_utf8_lossy(&received).contains("pty-hello"),
        "expected 'pty-hello' in PTY output, got: {:?}",
        String::from_utf8_lossy(&received)
    );
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
