---
name: feega
description: >-
  Operate feega (social media AI autopilot) via MCP tools or the feega CLI:
  brands, posts, plans, studio, SEO/GEO, blog, and AI chat. Use when the user
  mentions feega, feega.app, approving social posts, editorial plans,
  SEO/GEO audits, or managing brand content from an agent.
license: Apache-2.0
compatibility: >-
  Requires network access to feega.app (or PUBLIC_APP_URL). Prefer feega MCP
  when connected; otherwise the feega CLI (Bun or installed binary) after OAuth login.
metadata:
  author: andreabuttarelli
  version: "1.0.0"
  homepage: https://feega.app
  repository: https://github.com/andreabuttarelli/feega
  mcp: https://mcp.feega.app/mcp
---

# feega

Drive [feega](https://feega.app) — social media AI autopilot — through **MCP tools**
(preferred) or the **`feega` CLI**. Same OAuth identity. **No static API tokens.**

## Choose interface

| Situation | Action |
|-----------|--------|
| feega MCP is connected | Call MCP tools (`list_brands`, `list_posts`, …) |
| MCP not available | Shell: `feega …` after `feega login` |
| Vague / multi-step ask | MCP `chat` or `feega ai <slug> --message "…" --pipe` |

Never invent REST endpoints or API keys.

## Auth (always OAuth)

1. **Local MCP / CLI:** shared session at `~/.config/feega/session.json`. MCP tool `login` opens the browser, or run `feega login`.
2. **Remote MCP** (`https://mcp.feega.app/mcp`): send `Authorization: Bearer <access_token>` (same JWT the CLI stores). Missing Bearer → 401.
3. Verify with `whoami` / `list_brands` or `feega brands`.

Setup details: [references/mcp.md](references/mcp.md).

## Operating rules

1. Start with `list_brands` (or `feega brands`) to learn **slugs**.
2. Pass `slug` on every brand-scoped call.
3. Post/article ids accept **short unambiguous prefixes** from list output — never guess if ambiguous.
4. Prefer specific tools (`approve_posts`, `edit_post`, …) over `chat` for precise edits.
5. Confirm before reject / delete / discard unless the user clearly asked.

## Quick workflows

**Approve pending posts** → `list_posts` (status pending) → optional `get_post` → `approve_posts`.

**Fix one carousel slide** → `get_post` → `regenerate_slide` (`index`, instruction; 0 = cover).

**Blog draft** → `generate_article` → optional `optimize_article` → `publish_article` when asked.

## References (load on demand)

- [references/mcp.md](references/mcp.md) — connect MCP (stdio / HTTP), Cursor config, auth
- [references/tools.md](references/tools.md) — full MCP tool catalog + CLI equivalents
- [references/cli.md](references/cli.md) — install CLI and common commands

## Install this skill

```bash
npx skills add andreabuttarelli/feega --skill feega
```

Or copy `skills/feega/` into `.cursor/skills/feega/` / `~/.claude/skills/feega/`.
