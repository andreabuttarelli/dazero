// Re-export AgentPreset type from types.ts for convenience
export type { AgentPreset } from "../types";

// Keys that are considered built-in (ship with the binary defaults).
// Used in Settings to badge presets as built-in vs custom.
export const BUILTIN_KEYS = ["shell", "claude-code", "codex", "gemini", "opencode"] as const;

export function isBuiltin(key: string): boolean {
  return (BUILTIN_KEYS as readonly string[]).includes(key);
}
