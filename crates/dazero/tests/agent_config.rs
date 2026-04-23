use dazero::agent_config::{is_builtin, load_from};

#[test]
fn load_returns_builtins_when_file_missing() {
    let tmp = tempfile::TempDir::new().unwrap();
    let path = tmp.path().join("nope.toml");
    let cfg = load_from(&path).expect("load");
    assert_eq!(cfg.max_concurrent_agents, 5);
    // 5 built-in presets
    assert_eq!(cfg.presets.len(), 5);
    assert!(cfg.presets.iter().any(|p| p.key == "shell"));
    assert!(cfg.presets.iter().any(|p| p.key == "claude-code"));
}

#[test]
fn load_merges_user_presets_on_top() {
    let tmp = tempfile::TempDir::new().unwrap();
    let path = tmp.path().join("agents.toml");
    std::fs::write(
        &path,
        r##"
max_concurrent_agents = 8

[[presets]]
key = "claude-code"
label = "Claude Code (custom)"
initial_command = "claude --model claude-sonnet-4-6"
accent = "#ff0000"

[[presets]]
key = "aider-local"
label = "Aider (local LLM)"
initial_command = "aider --model ollama/llama3.1"
accent = "#8ae68a"
"##,
    )
    .unwrap();
    let cfg = load_from(&path).expect("load");
    assert_eq!(cfg.max_concurrent_agents, 8);
    assert_eq!(
        cfg.presets.len(),
        6,
        "5 built-ins - 1 overridden + 1 new = 6"
    );
    let cc = cfg.presets.iter().find(|p| p.key == "claude-code").unwrap();
    assert_eq!(cc.label, "Claude Code (custom)");
    assert_eq!(cc.accent, "#ff0000");
    let aider = cfg.presets.iter().find(|p| p.key == "aider-local").unwrap();
    assert_eq!(
        aider.initial_command.as_deref(),
        Some("aider --model ollama/llama3.1")
    );
}

#[test]
fn is_builtin_marks_correct_keys() {
    assert!(is_builtin("shell"));
    assert!(is_builtin("claude-code"));
    assert!(!is_builtin("aider-local"));
}
