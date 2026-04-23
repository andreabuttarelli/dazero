use dazero::pty::{PtyRegistry, PtySession};

#[tokio::test]
async fn recover_finds_existing_dazero_sessions() {
    // 1. Spawn a session manually (pre-existing scenario)
    let sess = PtySession::spawn_shell(None).expect("spawn");
    let original_id = sess.id;
    let tmux_name = sess.tmux_session.clone();

    // 2. Drop the session WITHOUT killing tmux — simulate daemon crash.
    //    (Just drop the Rust struct; don't call remove()/kill_tmux_session.)
    drop(sess);

    // 3. New registry boots and recovers.
    let registry = PtyRegistry::new();
    let recovered_ids = registry.recover().expect("recover");

    assert!(
        recovered_ids.contains(&original_id),
        "recovered ids {:?} should include {}",
        recovered_ids,
        original_id
    );
    assert!(
        registry.get(original_id).is_some(),
        "registry should contain the session after recover"
    );

    // Cleanup: kill the tmux session manually
    let _ = std::process::Command::new("tmux")
        .args(["kill-session", "-t", &tmux_name])
        .status();
}
