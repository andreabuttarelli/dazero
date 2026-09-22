# dazero CLI — infinite-canvas CLI, MCP Server & Agent Skill

[dazero](https://dazero.co) is an infinite canvas of typed nodes (text, image, video, doc,
iframe, social feed, social post mockup, products, ads) for producing and publishing social
content. This repository is its command-line client, [MCP server](docs/mcp.md) (Model Context
Protocol — `stdio` + HTTP) and agent skill: everything you need to read and write the canvas,
approve posts and manage ad campaigns from a terminal or an AI agent.

This repository ships **three ways** to drive the same product (same OAuth, same API, **no static tokens**):

| | What | Who it’s for |
|---|------|----------------|
| **CLI** | `dazero` terminal commands, brand-scoped | Humans & scripts |
| **MCP** | Model Context Protocol server (`stdio` + HTTP), org-scoped | Cursor, Claude, other MCP hosts |
| **Skill** | Agent Skill (`skills/dazero/`) | Coding agents / skills.sh / `npx skills` |

> **You need a dazero account.** This is a client, not a standalone tool: every call talks to
> the dazero API over HTTPS. Without an account there is nothing to drive.

With the dazero CLI you can browse brands, approve pending posts, edit a post's caption or media,
re-render a missing image, manage ad campaigns and re-sync a connected store's product catalog —
from the terminal **or** from an AI agent like Cursor or Claude talking to the MCP server.

```text
┌─────────────┐   ┌─────────────┐   ┌──────────────────┐
│  dazero   │   │  MCP host   │   │  Agent + Skill   │
│    CLI      │   │ (Cursor…)   │   │  (npx skills)    │
└──────┬──────┘   └──────┬──────┘   └────────┬─────────┘
       │                 │                   │
       │    lib/api.ts + OAuth session       │
       └─────────────────┼───────────────────┘
                         ▼
                 dazero /api/v1/*
```

---

## 1. CLI

### Install

Pick one:

| Method | Command | Notes |
|--------|---------|--------|
| **npm** | `npm install -g dazero-cli` | Needs Node.js ≥ 20 |
| **Homebrew** | see below | macOS / Linux, standalone binary |
| **Installer** | see below | curl script → binary on PATH |
| **From source** | see below | Needs [Bun](https://bun.sh) |

**npm**

```bash
npm install -g dazero-cli
# or:  pnpm add -g dazero-cli   /   bun add -g dazero-cli
dazero login
```

**Homebrew** — formula lives in the [`andreabuttarelli/homebrew-tap`](https://github.com/andreabuttarelli/homebrew-tap) repository:

```bash
brew tap andreabuttarelli/tap https://github.com/andreabuttarelli/homebrew-tap
brew install dazero
dazero login
```

**Installer (standalone binary)** — macOS arm64/x64 and Linux arm64/x64, no Node/Bun required:

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/dazero/main/cli/scripts/install.sh | bash
dazero login
```

Update later with `dazero update`, or `npm install -g dazero-cli@latest` / `brew upgrade dazero` depending on how you installed. More detail: [`docs/distribute.md`](docs/distribute.md).

### Quick start

```bash
dazero brands
dazero dashboard my-brand
dazero content my-brand --status pending_user
dazero approve my-brand --all
dazero calendar my-brand
dazero ads my-brand --remix
```

Every command takes the brand slug as its first argument. `dazero --help` lists them all;
`dazero <command> --help` details one. Short id prefixes from tables are accepted; ambiguous
prefixes error instead of guessing.

| Area | Commands |
|------|----------|
| Posts | `content`, `approve`, `post <id> [show\|edit\|render\|approve\|publish\|reschedule\|reject]` |
| Planning | `calendar` |
| Brand | `products [sync]` |
| Ads | `ads` — campaigns, spend, boost proposals, remix, duplicate/delete (`--sync`, `--propose`, `--remix`, `--create`, `--approve`, `--pause`, `--resume`, `--duplicate`, `--delete`, `--reject`, `--ad` per singola creatività) |
| Insight | `dashboard`, `status`, `health` |
| Account | `upgrade`, `update`, `login`, `logout` |

Full command dump: [`llms.txt`](llms.txt) · more docs: [`docs/`](docs/)

### From source

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero-cli
bun install
bun run cli.ts --help
```

---

## 2. MCP server

Same tools and OAuth as the CLI. Docs: **[`docs/mcp.md`](docs/mcp.md)**.

```bash
bun run mcp          # stdio (local hosts)
bun run mcp:http     # http://localhost:8787/mcp
```

Remote: `https://mcp.dazero.co/mcp` (Bearer JWT required). Health: `GET /health`.

**Cursor — stdio**

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

**Cursor — HTTP**

```json
{
  "mcpServers": {
    "dazero": { "url": "https://mcp.dazero.co/mcp" }
  }
}
```

If Connect fails with `Not an https or loopback URI: cursor://…`, your Cursor build is still
using the custom-scheme OAuth callback — use **stdio** above, update Cursor (loopback
`http://localhost:8787/callback`), or see [`docs/mcp.md`](docs/mcp.md#cursor--remote-http-oauth).

- Local stdio: `dazero login` (no sign-in tool) → `~/.config/dazero/session.json`
  (script/CI alternative: `dazero login --email tu@email --password …` or `--password-stdin`, no browser)
- Remote HTTP: `Authorization: Bearer <access_token>` (401 without it is expected)

---

## 3. Agent Skill & plugins

Publishable [Agent Skill](https://agentskills.io) for Cursor, Claude, skills.sh, and friends:

```bash
npx skills add andreabuttarelli/dazero --skill dazero
# or
bash scripts/install-skill.sh --project
```

Package: [`skills/dazero/`](skills/dazero/) → [`plugins/dazero/skills/dazero/`](plugins/dazero/) (`SKILL.md` + `references/` for MCP setup, tool map, CLI).

When the skill is active, agents prefer **MCP tools** if connected, otherwise the **CLI**.

### Claude Code / Codex marketplace plugin

Same skill + remote MCP, packaged for plugin install and directory submit:

```bash
# Claude Code
/plugin marketplace add andreabuttarelli/dazero
/plugin install dazero@dazero

# Codex
codex plugin marketplace add andreabuttarelli/dazero
```

Submit checklist (Claude community directory + OpenAI Plugins Directory): **[`docs/plugins.md`](docs/plugins.md)**.

---

## Configuration

Zero config by default → `https://dazero.co`, with automatic fallback to
`http://localhost:5173` when a local app is answering.

| Variable | Purpose |
|----------|---------|
| `PUBLIC_APP_URL` | Point CLI/MCP at another dazero instance |
| `SENTRY_DSN` | (MCP HTTP / Vercel) Errors → Sentry |
| `SUPABASE_SERVICE_ROLE_KEY` | (MCP HTTP / Vercel) Rows in `mcp_logs` |
| `MCP_PUBLIC_URL` | Public MCP base URL for OAuth metadata |

Session: `~/.config/dazero/session.json`. `dazero logout` clears it. No secrets are embedded
in this repo or the binary.

---

## Architecture

Thin HTTPS client — no DB access, no coupling to the dazero server codebase:

```
CLI  ──┐
MCP  ──┼── HTTPS ──►  /api/v1/*  ──►  dazero
Skill ─┘   (guides agents to CLI or MCP)
```

- CLI commands: `commands/` + `cli.ts`
- HTTP client: `lib/api.ts` only
- MCP: `mcp/` (reuses `lib/api.ts`, registers tools)
- Skill / plugins: `skills/dazero/` → `plugins/dazero/` (Claude + Codex marketplace manifests)

---

## Development

```bash
bun install
bun run cli.ts --help
bun run mcp
bun run mcp:http
bun run typecheck
bun test
bun run build             # binary → dist/
bun run build:all         # all four targets
bun run vercel-build      # MCP bundles under mcp/api/
```

Releases: push a `v*` tag → CI typechecks, tests, cross-compiles binaries + `.tar.gz` +
`SHA256SUMS.txt` on the GitHub Release, bumps [`Formula/dazero.rb`](Formula/dazero.rb),
and publishes `dazero-cli` to npm when `NPM_TOKEN` is set. Details: [`docs/distribute.md`](docs/distribute.md).

---

## License

Copyright © 2026 Andrea Buttarelli.

Licensed under the [Apache License 2.0](LICENSE). You may use, modify
and redistribute it, but derivative works must stay open source under the same license, must keep
the copyright notice, and must state their changes — including when offered to users over a
network.
