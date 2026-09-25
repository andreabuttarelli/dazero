# dazero MCP — setup & usage

Model Context Protocol server for dazero. Same HTTPS client and OAuth as the CLI.
**No static API tokens.**

```
Host (Cursor / Claude / …)
  ├─ stdio  → bun run mcp / dazero-mcp
  └─ HTTPS  → https://mcp.dazero.co/mcp  (+ Bearer on remote)
         └─ dazero API /api/v1/org/* and /api/v1/brands/:slug/*
```

## 1. Pick a transport

| Mode | When | Endpoint / command | Auth |
|------|------|--------------------|------|
| **stdio** | Local agent on your machine | `bun run mcp` or `dazero-mcp` | existing `dazero login` session |
| **HTTP local** | Local Streamable HTTP | `bun run mcp:http` → `http://localhost:8787/mcp` | Bearer **or** session file |
| **HTTP remote** | Shared / cloud host | `https://mcp.dazero.co/mcp` | **Bearer required** |

Health check (HTTP):

```bash
curl -sS https://mcp.dazero.co/health
# {"ok":true,"name":"dazero-mcp","transport":"streamable-http","mcp":"/mcp"}
```

OAuth resource metadata: `GET /.well-known/oauth-protected-resource`.

## 2. Configure the host

### Cursor — stdio (recommended locally)

Clone or install the repo, then in Cursor MCP settings:

```json
{
  "mcpServers": {
    "dazero": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/to/dazero/cli/mcp/stdio.ts"]
    }
  }
}
```

If the binary is on `PATH` after install:

```json
{
  "mcpServers": {
    "dazero": { "command": "dazero-mcp" }
  }
}
```

### Cursor — HTTP remote

```json
{
  "mcpServers": {
    "dazero": {
      "url": "https://mcp.dazero.co/mcp"
    }
  }
}
```

The host must send OAuth Bearer. If it cannot yet, use [mcp-remote](https://www.npmjs.com/package/mcp-remote) as a bridge, or prefer **stdio** locally.

### From source (dev)

```bash
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero/cli
bun install
bun run mcp          # stdio
bun run mcp:http     # http://localhost:8787/mcp
```

## 3. Authenticate

**Local (stdio / local HTTP)**

1. Run `dazero login` in a terminal — it opens the browser.
2. Session is stored at `~/.config/dazero/session.json` and shared with the CLI.
3. Confirm with a `query` on `brands` — rows come back, or you are not signed in.

**Remote HTTP**

Your host does this on its own: the server publishes `/.well-known/oauth-protected-resource` and
answers an unauthenticated call with `401 WWW-Authenticate: Bearer`, which is the standard round
Claude Code, Claude.ai and Cursor already know how to walk.

1. If you are calling it by hand: obtain a Supabase access token via dazero OAuth (same token
   inside `session.json` after CLI login: field used as Bearer).
2. Send on every request: `Authorization: Bearer <access_token>`.
3. Without it you get JSON-RPC **401** — that is expected, not a server crash.

There is **no** `DAZERO_TOKEN` / API-key path by design.

## 4. First calls

1. `query({ table: "brands", columns: ["id","slug","name","plan","status"] })` — confirm auth and
   learn which brands/orgs this session can see.
2. `query({ table: "posts", columns: ["id","status","caption"], where: [{ column: "status", op: "eq", value: "draft" }] })`
   — a brand's pending posts (add a `brand_id` filter once you have one).

Ids from list-derived reads accept short unambiguous prefixes (same rule as the CLI); a `where` on
`id` in `delete_row`/`update_row` needs the full id.

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 401 on `/mcp` | Missing/invalid Bearer on remote | Let the host do the OAuth round, or pass the access token yourself, or use stdio |
| 404 on `/health` | Wrong deploy root / path | Expect `/health` and `/mcp` on the MCP host |
| Tools missing | MCP not connected in host | Check Cursor MCP panel; restart host |
| Auth works in CLI but not MCP | Different machine / no session file | Run `dazero login` on the machine running the MCP server |
| `conflict` on `run_node_generation` | Stale `version` — someone else wrote the node since you read it | Re-read the node with `query`, take its current `version`, retry |
| `Not an https or loopback URI: cursor://anysphere.cursor-mcp/oauth/callback` | Cursor DCR uses a custom-scheme callback; dazero OAuth only allows https/loopback | Use **stdio** MCP, update Cursor (localhost `:8787` callback), or pass Bearer; see [docs/mcp.md](../../../docs/mcp.md#cursor--remote-http-oauth) |

## 6. More

- Full tool list: [tools.md](tools.md)
- CLI fallback: [cli.md](cli.md)
- Product: https://dazero.co · Repo: https://github.com/andreabuttarelli/dazero
