# dazero Skill (MCP + CLI)

Flat copy for Claude Code / multi-tool installers.  
**Canonical publishable skill:** [`dazero/SKILL.md`](./dazero/SKILL.md) (Agent Skills / skills.sh).

```bash
npx skills add andreabuttarelli/dazero --skill dazero
bash scripts/install-skill.sh --project
```

Prefer **MCP tools** when connected; otherwise the **`dazero` CLI**. OAuth only — no static tokens.
Details: [dazero/references/mcp.md](./dazero/references/mcp.md) · [tools.md](./dazero/references/tools.md) · [cli.md](./dazero/references/cli.md).

## Auth

- Local: MCP `login` or `dazero login` → `~/.config/dazero/session.json`
- Remote MCP (`https://mcp.dazero.co/mcp`): `Authorization: Bearer <access_token>`
- Start with `list_brands` / `dazero brands`

## Cursor MCP (stdio)

```json
{
  "mcpServers": {
    "dazero": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/to/dazero-cli/mcp/stdio.ts"]
    }
  }
}
```

## Cursor MCP (HTTP)

```json
{
  "mcpServers": {
    "dazero": { "url": "https://mcp.dazero.co/mcp" }
  }
}
```

## CLI fallback

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/dazero/main/cli/scripts/install.sh | bash
dazero login
dazero brands
dazero content <slug> --status pending_user
dazero approve <slug> --all
```
