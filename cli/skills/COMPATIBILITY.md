# AI Coding Tools — skill compatibility

## Publishable Agent Skill (recommended)

Package: [`skills/dazero/`](./dazero/) — follows [agentskills.io](https://agentskills.io/specification).  
Canonical for `npx skills` / skills.sh. The Claude/Codex plugin mirrors the same tree at [`plugins/dazero/skills/dazero/`](../plugins/dazero/skills/dazero/) — run `bash scripts/sync-plugin-skill.sh` after skill edits.

```bash
npx skills add andreabuttarelli/dazero --skill dazero
npx skills add andreabuttarelli/dazero --skill dazero -g   # global
```

Appears on directories that index public GitHub skills (e.g. skills.sh) via install telemetry — no separate submission.

| File | Role |
|------|------|
| `dazero/SKILL.md` | Frontmatter + short instructions |
| `dazero/references/mcp.md` | MCP connect / auth |
| `dazero/references/tools.md` | Tool ↔ CLI map |
| `dazero/references/cli.md` | CLI install + commands |

## Claude Code & Codex plugins (marketplace submit)

Installable plugin: [`plugins/dazero/`](../plugins/dazero/) (skill + remote MCP).  
Full submit checklist: [`docs/plugins.md`](../docs/plugins.md).

```bash
# Claude Code — add this repo as a marketplace, then install
/plugin marketplace add andreabuttarelli/dazero
/plugin install dazero@dazero

# Codex — add marketplace from the repo
codex plugin marketplace add andreabuttarelli/dazero
```

Public directory submit forms:

- Claude: [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)
- Codex / ChatGPT: [plugin submission portal](https://developers.openai.com/plugins/deploy/submission)

## Legacy / multi-tool installer

[`dazero-cli.md`](./dazero-cli.md) + `bash scripts/install-skill.sh` still copies into Claude, `.cursorrules`, `AGENTS.md`, etc.

| Tool | File | Location |
|------|------|----------|
| **Cursor Agent Skills** | `SKILL.md` | `.cursor/skills/dazero/` |
| **Claude Code** | `dazero-cli.md` or skill dir | `.claude/skills/` |
| **Cursor rules** | `.cursorrules` | Project root |
| **GitHub Copilot** | `copilot-instructions.md` | `.github/` |
| **AGENTS.md / llms.txt** | project docs | Root |

```bash
bash scripts/install-skill.sh --project
bash scripts/install-skill.sh --global
```
