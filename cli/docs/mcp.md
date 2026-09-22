# dazero MCP — how to use it

dazero exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so coding agents
(Cursor, Claude, etc.) can read and write the canvas — projects, canvases, nodes, posts, ad
campaigns — with the **same OAuth login as the CLI**. There are **no static API tokens**.

```
Your agent
   │  stdio (local)     →  bun run mcp  /  dazero-mcp
   │  HTTPS (remote)    →  https://mcp.dazero.co/mcp  + Bearer
   ▼
dazero API  (/api/v1/*)
```

## Quick start

### Option A — Local stdio (simplest)

1. Install [Bun](https://bun.sh) and clone the repo (or install the CLI binary).
2. Authenticate once:

```bash
dazero login
```

3. Add to Cursor MCP config (absolute path required):

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

4. Restart Cursor / reload MCP. Call `query` on `brands` to confirm auth and see what you can see.

Session file (shared with the CLI): `~/.config/dazero/session.json`.

### Option B — Remote HTTP (`mcp.dazero.co`)

1. Confirm the server is up:

```bash
curl -sS https://mcp.dazero.co/health
```

Expect: `{"ok":true,"name":"dazero-mcp","mcp":"/mcp",...}`.

2. Cursor MCP config:

```json
{
  "mcpServers": {
    "dazero": {
      "url": "https://mcp.dazero.co/mcp"
    }
  }
}
```

3. The host must send **`Authorization: Bearer <access_token>`** on every request.  
   Use the Supabase access token from dazero OAuth (same value the CLI stores after `dazero login`).  
   Without Bearer you get **401** — that is correct, not a crash.

If your client cannot attach Bearer yet, use [mcp-remote](https://www.npmjs.com/package/mcp-remote) or prefer **Option A**.

### Option C — Local HTTP

```bash
bun install
bun run mcp:http
# → http://localhost:8787/mcp
#    http://localhost:8787/health
```

Auth: Bearer **or** the local session file.

## What to call first

1. `query` on `brands` — confirm auth, see what you can see
2. `query` on `posts`, filtered by `brand_id` and `status` — approval queue
3. `list_posts` / `list_ad_campaigns` for the brand-scoped named reads

Post and ad campaign ids accept **short unambiguous prefixes** from list results (same rule as
the CLI).

## Tool areas

| Area | Tools |
|------|-------|
| Database (org-scoped) | `query`, `insert_row`, `update_row`, `delete_row`, `describe_node_types` |
| Canvas generation | `run_node_generation` |
| Posts | `list_posts`, `create_post`, `set_post_status` |
| Ads | `list_ad_campaigns`, `create_ad_campaign`, `approve_ad_campaign` |

12 tools total. Full map: [`skills/dazero/references/tools.md`](../skills/dazero/references/tools.md).

## Agent skill (directories / `npx skills`)

Publishable Agent Skill (agentskills.io):

```bash
npx skills add andreabuttarelli/dazero --skill dazero
```

Sources: [`skills/dazero/`](../skills/dazero/) (`SKILL.md` + `references/`).  
Claude/Codex marketplace plugin (skill + remote MCP): [`plugins/dazero/`](../plugins/dazero/) — see [`plugins.md`](plugins.md).

## Auth rules (summary)

| Context | How you authenticate |
|---------|----------------------|
| Local stdio / local HTTP | `dazero login` in a terminal → session file, shared with MCP |
| Remote HTTP | `Authorization: Bearer <jwt>` required |
| Static API key | **Not supported** |

Protected resource metadata: `GET /.well-known/oauth-protected-resource`.

## Cursor + remote HTTP OAuth

Cursor’s remote MCP connector discovers dazero’s authorization server and runs
[Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591). Some Cursor
builds still register the custom-scheme callback:

```text
cursor://anysphere.cursor-mcp/oauth/callback
```

dazero’s `/oauth/register` only accepts **https** or **loopback http** redirect URIs, so that
registration fails with:

```text
Not an https or loopback URI: cursor://anysphere.cursor-mcp/oauth/callback
```

**Workarounds (pick one):**

1. **Prefer stdio locally** (recommended) — no remote OAuth handshake:

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

Run `dazero login` first — there is no sign-in tool.

2. **Update Cursor** so MCP OAuth uses the loopback callback
   `http://localhost:8787/callback` (RFC 8252). That URI **is** accepted by dazero DCR.

3. **Bearer header** — after `dazero login`, put the access token from
   `~/.config/dazero/session.json` in the MCP config `headers.Authorization` (if your Cursor
   build supports headers on URL servers), or bridge with
   [mcp-remote](https://www.npmjs.com/package/mcp-remote).

**Permanent fix (dazero app, not this repo):** allowlist Cursor’s known redirect URIs in the
authorization server’s DCR validator (`/oauth/register`), including
`cursor://anysphere.cursor-mcp/oauth/callback` and
`https://www.cursor.com/agents/mcp/oauth/callback`, while keeping loopback `http://localhost`
/ `http://127.0.0.1` allowed.

## Deploy notes (operators)

Vercel project **Root Directory = `mcp`**. Artifacts: `mcp/api/*`, `mcp/vercel.json`.  
Rebuild bundles from repo root: `bun run vercel-build`.  
Optional env: `SENTRY_DSN`, `SUPABASE_SERVICE_ROLE_KEY`, `MCP_PUBLIC_URL`, `PUBLIC_APP_URL`.

## Development

```bash
bun run mcp
bun run mcp:http
bun test
bun run typecheck
npx @modelcontextprotocol/inspector bun run mcp/stdio.ts
```

Architecture: `mcp/stdio.ts` / `mcp/http.ts` + `mcp/api/*.js` → `http-router` → `http-app` → `server` → `lib/api.ts`.
