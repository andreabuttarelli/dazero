# dazero plugin — Claude Code & Codex submit

The installable plugin lives in [`plugins/dazero/`](../plugins/dazero/). It bundles:

- Agent skill → `skills/dazero/` (`SKILL.md` + `references/`)
- Remote MCP → `.mcp.json` → `https://mcp.dazero.co/mcp`
- Manifests → `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`

Repo marketplaces (self-host / team install):

| Agent | Marketplace file | Add / install |
|-------|------------------|---------------|
| Claude Code | [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) | `/plugin marketplace add andreabuttarelli/dazero` then `/plugin install dazero@dazero` |
| Codex / ChatGPT | [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json) | `codex plugin marketplace add andreabuttarelli/dazero` |

Local test (Claude):

```bash
claude --plugin-dir ./plugins/dazero
claude plugin validate ./plugins/dazero
claude plugin validate .   # marketplace + plugin
```

Canonical Agent Skill for `npx skills`: `skills/dazero/`.  
After editing it, sync into the plugin with `bash scripts/sync-plugin-skill.sh`.

## Submit to Claude community directory

1. Push this repo publicly (already on GitHub).
2. Run `claude plugin validate ./plugins/dazero` and fix issues.
3. Submit the **GitHub repo URL** at one of:
   - [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit) (Console — individuals)
   - [claude.ai admin submissions](https://claude.ai/admin-settings/directory/submissions/plugins/new) (Team / Enterprise)
4. After approval, the plugin is pinned in [`anthropics/claude-plugins-community`](https://github.com/anthropics/claude-plugins-community) (catalog sync can take up to ~24h).
5. Later commits to this repo are re-screened automatically — no re-submit for routine updates.

Docs: [Submitting your plugin](https://claude.com/docs/plugins/submit) · [Plugins](https://code.claude.com/docs/en/plugins)

## Submit to Codex / ChatGPT Plugins Directory

1. OpenAI Platform org with **Apps Management → Write** and a **verified** developer/business identity.
2. Open the [plugin submission portal](https://developers.openai.com/plugins/deploy/submission).
3. Create plugin → prefer **With MCP** (skills + MCP):
   - MCP URL: `https://mcp.dazero.co/mcp` (Universal)
   - Scan Tools, domain verification, tool annotations
   - Skills: upload the `plugins/dazero/skills/` tree **or** import static skills from MCP if exposed
4. Fill listing (logo, privacy `https://www.dazero.co/privacy`, terms `https://www.dazero.co/terms`, support/website).
5. Add starter prompts + **5 positive / 3 negative** test cases; demo credentials without MFA if reviewers need login.
6. Submit for review → after approval, **publish** from the portal (not automatic).

Docs: [Submit plugins](https://developers.openai.com/plugins/deploy/submission) · [Build plugins](https://developers.openai.com/codex/plugins/build)

## Auth note

Remote MCP requires an dazero OAuth Bearer JWT (same session as `dazero login`). Hosts that cannot attach Bearer should use local stdio MCP (`dazero-mcp` / `bun run mcp`) after CLI login — see [`docs/mcp.md`](mcp.md).
