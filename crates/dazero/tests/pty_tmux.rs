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

#[tokio::test]
async fn resize_propagates_to_tmux_window() {
    let sess = PtySession::spawn_shell(None).expect("spawn");

    // Resize to an unusual width
    sess.resize(133, 42).expect("resize");

    // Give tmux a beat to update
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Query tmux for the window dimensions
    let out = std::process::Command::new("tmux")
        .args([
            "display-message",
            "-p",
            "-t",
            &sess.tmux_session,
            "#{window_width} #{window_height}",
        ])
        .output()
        .unwrap();
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    // Output like "133 42"
    let parts: Vec<&str> = s.split_whitespace().collect();
    assert_eq!(
        parts.len(),
        2,
        "unexpected tmux display-message output: {s:?}"
    );
    let w: u16 = parts[0].parse().unwrap();
    let h: u16 = parts[1].parse().unwrap();
    assert_eq!(w, 133, "window width should be 133 after resize");
    assert_eq!(h, 42, "window height should be 42 after resize");

    sess.kill_tmux_session();
}
