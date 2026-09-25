# feega Skill (MCP + CLI)

Flat copy for Claude Code / multi-tool installers.  
**Canonical publishable skill:** [`feega/SKILL.md`](./feega/SKILL.md) (Agent Skills / skills.sh).

```bash
npx skills add andreabuttarelli/feega --skill feega
bash scripts/install-skill.sh --project
```

Prefer **MCP tools** when connected; otherwise the **`feega` CLI**. OAuth only — no static tokens.
Details: [feega/references/mcp.md](./feega/references/mcp.md) · [tools.md](./feega/references/tools.md) · [cli.md](./feega/references/cli.md).

## Auth

- Local: `feega login` (terminal) → `~/.config/feega/session.json`, shared with the MCP server
- Remote MCP (`https://mcp.feega.app/mcp`): `Authorization: Bearer <access_token>`
- Confirm with a `query` on `brands` (MCP) or `feega brands` (CLI) — never guess a brand or org

## Cursor MCP (stdio)

```json
{
  "mcpServers": {
    "feega": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/to/feega-cli/mcp/stdio.ts"]
    }
  }
}
```

## Cursor MCP (HTTP)

```json
{
  "mcpServers": {
    "feega": { "url": "https://mcp.feega.app/mcp" }
  }
}
```

## CLI fallback

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/feega/main/cli/scripts/install.sh | bash
feega login
feega brands
feega content <slug> --status pending_user
feega approve <slug> --all
```
