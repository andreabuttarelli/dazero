# feega MCP tools ↔ CLI

Twelve tools, all reachable through the org you belong to — no `slug` required on any of them,
because the canvas is org-scoped and a brand is only a `brand_id` value inside it. Ids accept short
unambiguous prefixes on list-derived reads; a `where` on `id` in `delete_row` and `update_row`
takes the full id, because an ambiguous prefix would touch the wrong row and neither comes back.

The CLI is narrower: it is brand-scoped (`feega <command> <slug>`) and does not expose `query`,
`insert_row`, `update_row`, `delete_row`, `describe_node_types` or `run_node_generation` — those
are MCP only, because they reach the whole database directly, which the CLI's fixed set of
brand-scoped REST endpoints does not.

## Auth

| MCP | CLI |
|-----|-----|
| (none — the host does OAuth on HTTP, `feega login` locally) | `feega login` / `feega logout` |
| — | `feega brands` |

There is no sign-in tool. On remote HTTP the host walks the OAuth round itself; on stdio the
session is the CLI's, so `feega login` in a terminal covers both. Confirm with `query` on
`brands` (MCP) or `feega brands` (CLI): rows come back, or nobody is signed in.

## Reading is one tool

| MCP | CLI |
|-----|-----|
| `query` | (MCP only — the CLI's reads are the fixed commands below) |

`query` reads ANY table your org can see, **as you**: the request runs with your own session, so
Postgres RLS returns exactly the rows you would see in the app and nothing more. It is READ ONLY by
construction — you name a table, columns and filters, it issues one PostgREST read, and a write has
nowhere to go. No SQL string, no joins, no function calls. It calls no model and costs nothing.

### The whole shape

- **`table`** — omit it and you get the list of every table you can name. Ask for a table with no
  `columns` and you get real rows with every column: the keys of a row ARE the schema.
- **`columns`** — **always name them.** Without them every column comes back, the character cap
  drops whole rows to fit, and a long question gets a short answer.
- **`where`** — filters ANDed together, each `column` / `op` / `value`, where `op` is one of `eq`,
  `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`, `cs`, `cd`. `in` takes an array,
  `is` takes null / true / false. **`negate: true` inverts that one filter**, which is how `is
  null` becomes `is not null`.
- **`order`** — one column or an array of them, applied in that order. Descending unless
  `ascending` is set, and `nullsFirst` decides where the empty values sit.
- **`embed`** — a related table brought along through its foreign key, with its own `columns`. RLS
  applies to it too: a post with the nodes it came from arrives in one call.
- **`offset`** — the next page. When rows were dropped, `limits` in the reply names the offset that
  resumes the read.
- **`count`** — `"estimated"` (the planner's guess, the default) or `"exact"`, which counts the
  matching rows for real and puts the number in `total`. Use it when the number IS the answer.
- **`limit`** — 20 by default, **200 at most**.
- **`org`** — which org, only if you belong to more than one. Omit to use the default; an API key
  ignores it, because its org is fixed by the key.

**One row is a document.** With `limit: 1` long text comes back whole — that is how you read a
node's full prompt or a post's full caption before rewriting it. With many rows long values are cut
at 2 000 characters and `limits` names the columns that were cut. Every cap that bites is named
there; none of them is silent.

One table per call plus whatever `embed` brings: read two unrelated tables and match the ids
yourself. A refusal comes back as `200` with `error`, `message` and often `fix` inside, so you can
read why and change your call.

### Where the reads went

| you want | how |
|---|---|
| your projects/brands | `query` on `brands` — `id`, `slug`, `name`, `plan`, `status`; CLI `feega brands` |
| the brand at a glance | `feega dashboard <slug>` and `feega status <slug>` — no single table stands in for them |
| a project's canvases | `query` on `canvases` — `id`, `name`, `project_id`, `viewport`, filtered `project_id` `eq` |
| the nodes on a canvas | `query` on `nodes` — `id`, `type`, `data`, `version`, filtered `canvas_id` `eq` and `deleted_at` `is` null |
| a node's connections | `query` on `nodes_connections` — `source_node_id`, `target_node_id`, `target_handle`, filtered on the canvas's node ids |
| posts, by status | `query` on `posts` — `id`, `status`, `caption`, `scheduled_for`, `brand_id`; CLI `feega content <slug> [--status …]` |
| one post, whole | the same read with an `id` filter and `limit: 1`; CLI `feega post <slug> <id>` |
| the calendar | `query` on `scheduled_posts` or `posts` filtered on `scheduled_for`; CLI `feega calendar <slug> [--month YYYY-MM]` |
| what a post came from | `query` on `post_sources` embedding `nodes`, filtered `post_id` `eq` |
| ad campaigns | `query` on `ad_campaigns` — `id`, `name`, `status`, `budget_amount`, `budget_type`, `approved_by`; CLI `feega ads <slug>` |
| products | `query` on `products` — `id`, `title`, `pricing`, `url`, `featured`, `images`; CLI `feega products <slug>` |
| connected accounts | `query` on `social_accounts` — `platform`, `username`, `status`, `connected_at` |
| what `nodes.data` must look like | `describe_node_types` — not a `query`, since it reads a schema, not a table |

## Writing a row that has no tool of its own

| MCP | CLI |
|-----|-----|
| `insert_row` | (MCP only) |
| `update_row` | (MCP only) |
| `delete_row` | (MCP only) |
| `describe_node_types` | (MCP only) |

`insert_row`, `update_row` and `delete_row` are `query` turned around: the same session, the same
tables, the same absence of SQL — and the same consequence, that what they cannot express does not
happen. There is no upsert.

`insert_row({ org, table, values })` adds one row. `org_id` is filled in for you; naming a
different one is refused rather than quietly corrected. It never replaces anything: a row that is
already there comes back as a collision naming the key you hit, and changing it is `update_row`.
Several jsonb columns are checked against a real shape before writing — `nodes.data` by `type`
(call `describe_node_types` first), `posts.media`, `ad_campaigns.targeting`/`placements`,
`canvases.viewport` — a rejection names the exact field.

`update_row({ org, table, where, values })` changes rows that exist. **Only the columns you send
are touched** — everything else in the row is left exactly as it was. `where` is required and may
not be empty, at most 50 rows move per call, and the rows are counted before anything is written,
so "nothing matched" comes back as a refusal instead of a cheerful success.

`delete_row({ org, table, where })` removes rows, and **this does not come back**. `where` is
required and may not be empty — a delete with no filter would empty everything you can reach. The
ceiling is **10 rows per call**, and it is not a truncation: the matches are counted BEFORE
anything goes, so a filter that hits eleven is refused whole and you are told how many it hit.

`describe_node_types({ org, type? })` returns the JSON Schema `insert_row`/`update_row` actually
enforce on `nodes.data`, per `type` (`text`, `image`, `video`, `doc`, `iframe`,
`social_account_feed`, `social_post_mockup`, `products`, `ads`, `influencer`, `list`, `select`,
`effects`). Omit `type` for all thirteen at once. Model/aspect-ratio/duration limits are NOT here
— call `run_node_generation` and read its refusal, or check the model's own docs, since those are
a fact of the model, not the node.

`effects` holds a stack of image filters (pixelate, posterize, duotone, dither, halftone, noise,
rgb-shift, glitch, wave, swirl, pinch, ascii, random-colors) over an upstream image — the schema
returned for it lists every effect's params with their ranges/options/defaults. Set the stack with
`update_row`, then call `apply_effects` to render it.

## Generation

| MCP | CLI |
|-----|-----|
| `run_node_generation` | (MCP only — the canvas UI's Generate button is the equivalent, not a CLI command) |
| `enhance_prompt` | (MCP only) |

`enhance_prompt({ org, prompt, model, shot_mode? })` rewrites a brief into the shape the given
model wants — labelled sections, one paragraph, a command when editing, whatever that model's
craft calls for. It rewrites, it never invents: a rewrite that adds a subject, asks for readable
text or states an aspect ratio is thrown away, and the original comes back with `changed: false`
and why in `notes`, same as a model with no guide. No brand, no draw, no file — spends credits.

`run_node_generation({ org, node_id, medium, prompt, model, version, params? })` fills an existing
canvas node — it never creates one (`insert_row` does that). `medium` (`text`, `image` or `video`)
must match the node's own `type`, or the call is refused before anything is spent. `version` is
optimistic concurrency: pass the node's current `nodes.version`, and a stale value comes back
`conflict` rather than a silent overwrite — re-read the node with `query` and retry with the fresh
version.

A `video` never returns finished here: it comes back `queued` with an `external_job_id` on the
run, and the render lands later, asynchronously — the node stays `running` until a later tick
deposits the asset. Poll the node (`query`) rather than expecting a file now. Spends credits; a
`credits_exhausted` failure means the org is out.

`apply_effects({ org, node_id })` renders an `effects` node's stack onto its upstream image and
writes the result as the node's `refId` — the same render `EffectsEditor` does in the browser, for
when there is no browser. Set the stack first with `update_row` on `nodes.data.effects`, then call
this. Spends no credits.

## Node loops

| MCP | CLI |
|-----|-----|
| `run_node_loop` | (MCP only) |
| `preview_node_loop` | (MCP only) |
| `cancel_node_loop` | (MCP only) |

`run_node_loop({ org, node_id, confirm? })` queues every combination from a node's `iterate`
wires (or a plain "repeat N" when it has none) through the same engine as `run_node_generation` —
one real run per combination, never a copy of it. It returns as soon as the queue is written, NOT
when the results exist: combinations run a few at a time as a background tick drains the queue
over the following minutes. Up to 50 queues directly; above 50 it comes back `needs_confirmation`
with the count and the credit cost — call again with `confirm: true`; above 1000 it is refused
outright and the loop must be split. Credits for the whole loop are checked up front, not
discovered empty halfway. A failed combination never stops the others; results land in an output
`list` node next to this one as they finish, each item labelled with which values produced it —
poll that node (`query`) to see progress.

`preview_node_loop({ org, node_id })` reads how many combinations `run_node_loop` would queue
right now and what they would cost. Spends nothing — call it before `run_node_loop` when the
count is not already known, rather than guessing at whether `confirm` will be needed.

`cancel_node_loop({ org, node_id })` stops the combinations still queued for this node — the ones
a tick has already claimed finish regardless, and anything already produced stays in the output
list. Returns how many combinations it actually stopped.

## Posts

| MCP | CLI |
|-----|-----|
| `list_posts` | `feega content <slug> [--status …]` |
| `create_post` | (MCP only) |
| `set_post_status` | (MCP only — CLI equivalents are `feega post <slug> <id> approve\|publish\|reject`) |
| — | `feega post <slug> <id> edit …` |
| — | `feega post <slug> <id> render` |
| — | `feega post <slug> <id> reschedule --scheduledFor …` |
| — | `feega approve <slug> [--all] [--dry]` |

A post (`posts` table) is the promoted artifact — caption, media, brand — different from a canvas
node, which is raw material. `post_sources` links a post back to the nodes it came from.

`list_posts({ org, brand_id, status? })` reads one brand's posts, filtered by `draft`, `ready` or
`archived`. Free.

`create_post({ org, brand_id, caption, media?, title?, link_url?, sources? })` turns material into
a post: give it a brand, the copy (you write it — this calls no model) and its media (asset ids
already in this org). `sources` optionally links back to the nodes it came from
(`role: caption|media|reference`). Lands as `draft`; nothing is scheduled or published from here.
Free.

`set_post_status({ org, id, status })` moves a post between `draft`, `ready` and `archived`. Does
not schedule or publish it. Free.

The CLI's post surface is a different, older-shaped set of REST endpoints that still work
brand-scoped: `feega post <slug> <id> edit` changes caption/title/link/subreddit/media/platforms
without a render or a credit; `render` draws the missing image from the post's prompt; `approve`
schedules it; `publish` sends it immediately; `reschedule --scheduledFor …` moves it; `reject`
deletes a pending one. `feega approve <slug> --all` approves every pending post in one pass — MCP
has no equivalent on purpose: `set_post_status` moves one post's status at a time, and there is no
approve-everything tool, because approving distribution for a whole queue from a misread question
is the incident this asymmetry exists to prevent.

## Ads

| MCP | CLI |
|-----|-----|
| `list_ad_campaigns` | `feega ads <slug>` |
| `create_ad_campaign` | `feega ads <slug> --create --name … --headline …` |
| `approve_ad_campaign` | `feega ads <slug> --approve <id>` |

An ad campaign spends real money, so `create_ad_campaign` never produces something already
publishable: it always drafts `draft`, `approved_by: null`. `approve_ad_campaign` is the only door
that lets it spend, and it is refused over an API key on purpose — an agent cannot approve its own
spend. This only works from a signed-in person's own session (the app, `feega login`, or the MCP
host doing OAuth). If you are an agent and this fails, tell the person to approve it themselves.

`list_ad_campaigns({ org, brand_id, status? })` reads a brand's campaigns with their status and
whether a human has approved them yet. Free.

`create_ad_campaign({ org, brand_id, ad_account_id, name, objective, budget_type, budget_amount,
starts_at?, ends_at? })` drafts a new campaign against a brand's ad account. `objective` is one of
`awareness`, `traffic`, `engagement`, `video_views`, `lead_generation`, `conversions`,
`app_promotion`, `catalog_sales`. `budget_type` is `daily` or `lifetime`. Nothing is scheduled or
billed by calling this. Free.

`approve_ad_campaign({ org, id })` lets a drafted campaign spend.

The CLI's `feega ads <slug>` surface also covers what MCP does not expose yet — sync, propose,
remix, pause/resume, duplicate, delete — through a single brand-scoped REST endpoint
(`/api/v1/brands/:slug/ads`), separate from the org-scoped `ad_campaigns` table MCP reads and
writes.
