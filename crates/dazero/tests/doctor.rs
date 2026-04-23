// tests/doctor.rs
use std::process::Command;

#[test]
fn doctor_prints_versions() {
    let out = Command::new(env!("CARGO_BIN_EXE_dazero"))
        .arg("doctor")
        .output()
        .expect("run dazero doctor");
    let s = String::from_utf8_lossy(&out.stdout);
    assert!(
        s.contains("dazero"),
        "expected 'dazero' in output, got: {s}"
    );
    // tmux is a system prerequisite on this test host
    assert!(s.contains("tmux"), "expected 'tmux' in output, got: {s}");
    assert!(
        out.status.success(),
        "doctor should exit 0 when tmux present"
    );
}
