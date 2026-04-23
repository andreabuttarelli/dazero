export type AgentPreset = {
  key: "shell" | "claude-code" | "codex" | "gemini" | "opencode";
  label: string;
  initial_command: string | null; // null = plain shell
  accent: string; // hex color used in node border/header
};

export const AGENT_PRESETS: AgentPreset[] = [
  { key: "shell",       label: "Terminal",    initial_command: null,        accent: "#2a6475" },
  { key: "claude-code", label: "Claude Code", initial_command: "claude",    accent: "#e08a4a" },
  { key: "codex",       label: "Codex",       initial_command: "codex",     accent: "#45c089" },
  { key: "gemini",      label: "Gemini CLI",  initial_command: "gemini",    accent: "#6a8cff" },
  { key: "opencode",    label: "opencode",    initial_command: "opencode",  accent: "#b28cff" },
];
