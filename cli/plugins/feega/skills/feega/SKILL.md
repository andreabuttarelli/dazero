---
name: dazero
description: >-
  Operate dazero (infinite canvas for social content) via MCP tools or the
  dazero CLI: canvas nodes, generation, posts, ad campaigns. Use when the user
  mentions dazero, dazero.co, a dazero canvas, approving social posts, or
  managing brand content and ads from an agent.
license: Apache-2.0
compatibility: >-
  Requires network access to dazero.co (or PUBLIC_APP_URL). Prefer dazero MCP
  when connected; otherwise the dazero CLI (Bun or installed binary) after OAuth login.
metadata:
  author: andreabuttarelli
  version: "2.0.0"
  homepage: https://dazero.co
  repository: https://github.com/andreabuttarelli/dazero
  mcp: https://mcp.dazero.co/mcp
---

# dazero

Drive [dazero](https://dazero.co) — an infinite canvas of typed nodes (text, image, video, doc,
iframe, social feed, social post mockup, products, ads) — through **MCP tools** (preferred) or the
**`dazero` CLI**. Same OAuth identity. **No static API tokens.**

## Choose interface

| Situation | Action |
|-----------|--------|
| dazero MCP is connected | Call MCP tools (`query`, `create_post`, `run_node_generation`, …) |
| MCP not available | Shell: `dazero …` after `dazero login` |

MCP reaches the whole org: any project, canvas, node, post or ad campaign the signed-in user can
see. The CLI is narrower and always brand-scoped — it is the fallback for approving, editing and
reading posts and ads without a connected agent. Never invent REST endpoints or API keys.

## Auth (always OAuth)

**Signing in is not a tool** — there is nothing to call. Two paths, and both end in the same JWT:

1. **Local MCP / CLI:** run `dazero login` in a terminal, once. The session lands in
   `~/.config/dazero/session.json` and the CLI and the MCP server share it.
2. **Remote MCP** (`https://mcp.dazero.co/mcp`): your host does the OAuth round itself — it reads
   `/.well-known/oauth-protected-resource` and answers the `401 WWW-Authenticate: Bearer`
   challenge. Nothing for you to do; a missing Bearer is a 401, not a broken server.

Confirm it worked with `query` on `projects` or `dazero brands`: rows come back, or you are not
signed in.

Setup details: [references/mcp.md](references/mcp.md).

## Operating rules

1. **Never guess an org, a brand or a project.** Most calls default to the caller's own org and
   need nothing named; the tools that DO need a `brand_id` or `project_id` take it as an input —
   read it back with `query` first (recipe below), never invent one. Guessing spends a real
   organisation's credits and writes into a real client's canvas.
2. Post ids and ad campaign ids accept short unambiguous prefixes from list output — never guess
   if ambiguous.
3. `run_node_generation` needs the node's current `version` (optimistic concurrency): read the
   node with `query` first, pass that number, and if the call comes back `conflict`, re-read and
   retry — never assume your write landed.
4. A canvas node is raw material; a post (`list_posts`/`create_post`/`set_post_status`) is the
   promoted artifact ready to schedule. Writing a node is not an action on the world; promoting
   one to a post is.
5. An ad campaign always drafts unapproved. `approve_ad_campaign` only works from a signed-in
   person's own session — an API key (an agent acting alone) is refused on purpose. If you are an
   agent and this fails, tell the person to approve it themselves.
6. Confirm before deleting unless the user clearly asked: `delete_row` does not come back.

## Reading is one tool

**`query` is the read.** Every table your org can see — projects, canvases, nodes, connections,
assets, posts, ad campaigns, products, social accounts — the request runs with your own session,
so Postgres RLS returns exactly the rows you would see in the app and nothing more. Read only, no
credits, no model. Omit `table` to list what you can name; ask for a table with no `columns` and
the keys of a row are the schema.

**Always name `columns`.** Without them `query` returns every column, the character cap then drops
whole rows to fit, and a long question gets a short answer.

**Nothing is out of reach.** `offset` is the next page. `count: "exact"` when the number IS the
answer. `negate: true` on a filter turns `is null` into `is not null`. `order` takes several
columns and `nullsFirst`. `embed` brings a related table along through its foreign key, with RLS
applied to it too.

**One row is a document.** With `limit: 1` long text comes back whole. With many rows long values
are cut at 2 000 chars and `limits` says in which columns.

### The queries you will actually need

| you want | call |
|---|---|
| which projects/brands you have | `query({table:"brands", columns:["id","slug","name","plan","status"]})` |
| a project's canvases | `query({table:"canvases", columns:["id","name","project_id"], where:[{column:"project_id",op:"eq",value:"…"}]})` |
| the nodes on a canvas | `query({table:"nodes", columns:["id","type","data","version","canvas_id"], where:[{column:"canvas_id",op:"eq",value:"…"},{column:"deleted_at",op:"is",value:null}]})` |
| a node's current version (before generating into it) | same read, `limit:1` on the node's `id`, read back `version` |
| posts waiting on the calendar | `query({table:"posts", columns:["id","status","caption","scheduled_for","brand_id"], where:[{column:"brand_id",op:"eq",value:"…"},{column:"status",op:"eq",value:"draft"}]})` |
| ad campaigns and their spend | `query({table:"ad_campaigns", columns:["id","name","status","budget_amount","budget_type"], where:[{column:"brand_id",op:"eq",value:"…"}]})` |
| what a brand sells | `query({table:"products", columns:["id","title","pricing","url","featured"]})` |
| connected social accounts | `query({table:"social_accounts", columns:["platform","username","status"]})` |

**A row in a table nothing else writes** → `insert_row`, `update_row` and `delete_row`, `query`
turned around. `insert_row({table, values})` adds one row; `org_id` is filled in for you, and a
row that already exists comes back as a collision instead of replacing anything. `update_row({table,
where, values})` touches only the columns you send and needs a non-empty `where`, at most 50 rows a
call. `delete_row({table, where})` removes rows from your org, needs a non-empty `where` too, at most
10 rows a call, and it does not come back. `describe_node_types` gives the JSON Schema `nodes.data` must match per `type`
before you insert or update one — call it before writing a node's `data`.

## Generate into a node

`run_node_generation` is the canvas **Generate** button, for an agent: it fills an existing node
with text, image or video — it never creates a node (`insert_row` does that). `medium` must match
the node's own `type`, or the call is refused before anything is spent. Pass the node's current
`nodes.version`; a stale value comes back `conflict`, never a silent overwrite. A `video` never
returns finished here — it comes back `queued` with an `external_job_id`, and the render lands
later on a tick you do not control: poll the node with `query` rather than waiting on this call.
Spends credits; `credits_exhausted` means the org is out.

## Loop a node over many combinations

`run_node_loop` queues every combination from a node's `iterate` wires (or a plain "repeat N")
through the same engine as `run_node_generation` — one real run per combination. It returns as
soon as the queue is written, not when the results exist: a background tick drains it over the
following minutes, and results land in an output `list` node next to this one — poll that with
`query`. Above 50 combinations it comes back `needs_confirmation` with the count and cost; call
again with `confirm: true`. Above 1000 it is refused outright and the loop must be split. Credits
for the whole loop are checked up front. `preview_node_loop` reads how many combinations would
queue and what they would cost, without spending anything — call it first when the count is not
already known. `cancel_node_loop` stops what is still queued; anything a tick already claimed
finishes regardless, and what it already produced stays in the output list.

## Promote to a post

A canvas node is not a post. `create_post` is what makes something publishable: give it a
`brand_id`, a `caption` and its `media` (asset ids already in this org); `sources` optionally
links back to the nodes it came from. It lands as `draft` — nothing is scheduled or published from
here. `set_post_status` moves it between `draft`, `ready` and `archived`, still without publishing
it. `list_posts` filters by brand and status.

## Ad campaigns

`list_ad_campaigns` reads a brand's campaigns and their status. `create_ad_campaign` drafts one
against a brand's ad account — objective, budget type and amount, optional start/end — and it
always lands `draft` with no `approved_by`: nothing here can make it spend. `approve_ad_campaign`
is the only door that lets it spend, and it only opens for a signed-in person's own session.

## References (load on demand)

- [references/mcp.md](references/mcp.md) — connect MCP (stdio / HTTP), Cursor config, auth
- [references/tools.md](references/tools.md) — full MCP tool catalog + CLI equivalents
- [references/cli.md](references/cli.md) — install CLI and common commands

## Install this skill

```bash
npx skills add andreabuttarelli/dazero --skill dazero
```

Or install the marketplace plugin (skill + remote MCP):

```bash
# Claude Code
/plugin marketplace add andreabuttarelli/dazero
/plugin install dazero@dazero

# Codex
codex plugin marketplace add andreabuttarelli/dazero
```

Or copy this folder into `.cursor/skills/dazero/` / `~/.claude/skills/dazero/`.  
Submit / packaging details: [`docs/plugins.md`](../../../../docs/plugins.md).
