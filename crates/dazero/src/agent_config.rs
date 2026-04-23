use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPreset {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub initial_command: Option<String>,
    #[serde(default = "default_accent")]
    pub accent: String,
}

fn default_accent() -> String {
    "#888888".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FileConfig {
    #[serde(default)]
    pub max_concurrent_agents: Option<u32>,
    #[serde(default)]
    pub presets: Vec<AgentPreset>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Config {
    pub max_concurrent_agents: u32,
    pub presets: Vec<AgentPreset>,
}

pub const BUILTIN_PRESETS: &[(&str, &str, Option<&str>, &str)] = &[
    ("shell", "Terminal", None, "#2a6475"),
    ("claude-code", "Claude Code", Some("claude"), "#e08a4a"),
    ("codex", "Codex", Some("codex"), "#45c089"),
    ("gemini", "Gemini CLI", Some("gemini"), "#6a8cff"),
    ("opencode", "opencode", Some("opencode"), "#b28cff"),
];

pub fn default_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".dazero")
        .join("agents.toml")
}

pub fn load() -> Result<Config> {
    load_from(&default_config_path())
}

pub fn load_from(path: &Path) -> Result<Config> {
    let file = match std::fs::read_to_string(path) {
        Ok(s) => {
            toml::from_str::<FileConfig>(&s).with_context(|| format!("parse {}", path.display()))?
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => FileConfig::default(),
        Err(e) => return Err(e).context("read config"),
    };

    // Merge: start from built-ins, override by key with user presets.
    let mut presets: Vec<AgentPreset> = BUILTIN_PRESETS
        .iter()
        .map(|(k, l, ic, a)| AgentPreset {
            key: (*k).into(),
            label: (*l).into(),
            initial_command: ic.map(|s| s.to_string()),
            accent: (*a).into(),
        })
        .collect();

    for user in file.presets {
        if let Some(slot) = presets.iter_mut().find(|p| p.key == user.key) {
            *slot = user;
        } else {
            presets.push(user);
        }
    }

    Ok(Config {
        max_concurrent_agents: file.max_concurrent_agents.unwrap_or(5),
        presets,
    })
}

pub fn save_to(path: &Path, presets_user_only: &[AgentPreset], max: u32) -> Result<()> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).ok();
    }
    let file = FileConfig {
        max_concurrent_agents: Some(max),
        presets: presets_user_only.to_vec(),
    };
    let s = toml::to_string_pretty(&file).context("serialize config")?;
    std::fs::write(path, s).context("write config")?;
    Ok(())
}

pub fn is_builtin(key: &str) -> bool {
    BUILTIN_PRESETS.iter().any(|(k, _, _, _)| *k == key)
}
