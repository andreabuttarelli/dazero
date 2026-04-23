use dazero::pty::PtySession;
use tokio::time::{timeout, Duration};

#[tokio::test]
async fn pty_runs_inside_tmux_and_survives_session_probe() {
    let sess = PtySession::spawn_shell(None).expect("spawn");
    // The tmux session must exist now.
    let list = std::process::Command::new("tmux")
        .args(["has-session", "-t", &sess.tmux_session])
        .status()
        .unwrap();
    assert!(
        list.success(),
        "tmux session {} should exist",
        sess.tmux_session
    );

    // Basic round-trip
    sess.write(b"echo dazero-tmux-ok\n").await.expect("write");
    let mut buf = Vec::new();
    let res = timeout(Duration::from_secs(5), async {
        loop {
            let chunk = sess.read_some().await.expect("read");
            buf.extend_from_slice(&chunk);
            if String::from_utf8_lossy(&buf).contains("dazero-tmux-ok") {
                break;
            }
        }
    })
    .await;
    assert!(
        res.is_ok(),
        "timed out: {:?}",
        String::from_utf8_lossy(&buf)
    );

    // Cleanup
    sess.kill_tmux_session();
}
