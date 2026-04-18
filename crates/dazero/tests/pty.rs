use dazero::pty::PtySession;
use tokio::time::{timeout, Duration};

#[tokio::test]
async fn pty_echo_roundtrip() {
    let sess = PtySession::spawn_shell(None).expect("spawn");
    sess.write(b"echo hello-pty\n").await.expect("write");

    // Leggi fino a vedere "hello-pty" (max 3s)
    let mut buf = Vec::new();
    let res = timeout(Duration::from_secs(3), async {
        loop {
            let chunk = sess.read_some().await.expect("read");
            buf.extend_from_slice(&chunk);
            if String::from_utf8_lossy(&buf).contains("hello-pty") {
                break;
            }
        }
    })
    .await;
    assert!(
        res.is_ok(),
        "timed out waiting for echo output: {:?}",
        String::from_utf8_lossy(&buf)
    );
}
