// crates/dazero/tests/smoke.rs
use std::process::Command;

#[test]
fn cli_prints_version() {
    let output = Command::new(env!("CARGO_BIN_EXE_dazero"))
        .arg("--version")
        .output()
        .expect("failed to run dazero --version");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("dazero"),
        "expected 'dazero' in output, got: {stdout}"
    );
    assert!(
        stdout.contains("0.1.0"),
        "expected '0.1.0' in output, got: {stdout}"
    );
}
