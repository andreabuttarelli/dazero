# Server-side effects render, and MCP catches up to 13 node types

`effects` nodes only rendered in the browser (`EffectsEditor.svelte` → `applyStack`
→ upload). An agent driving the canvas via MCP had no way to render one — it
could set the stack with `update_row` but nothing would ever produce a `refId`.

`src/lib/server/canvas/apply-effects.ts` (`applyEffectsNode`) is the same
`applyStack` engine run server-side: reads the node, downloads the upstream
image's bytes from `canvas-assets` (or fetches it if `asset.url` is a full
URL), decodes to RGBA with `sharp` (already a server dependency, used by
`raster-image.ts` — nothing new added), runs the stack, re-encodes PNG,
stores it as a `canvas-assets` asset via the same `insertAsset` path uploads
use, and writes `{ refId, sourceRefId }` with `writeNodeData`'s existing
optimistic concurrency (`conflict` outcome on a stale version, no retry loop
duplicated from `generate.ts`). No AI call, no credits.

Wired end to end: `POST /api/v1/org/nodes/:id/apply-effects`
(`src/routes/api/v1/org/nodes/[id]/apply-effects/+server.ts`, same auth shape
as `.../generate`) and MCP tool `apply_effects`
(`cli/mcp/tools/nodes.ts`). Tool count in `cli/mcp/read-tools.test.ts` moved
11 → 12 kept tools (16 total on the surface).

`describe_node_types`'s hardcoded 12-type enum (`cli/mcp/tools/org-data.ts`)
was already stale — missing `effects` — and would go stale again at the next
node type. Replaced with a free-form `type: z.string().optional()`: the
server (`isNodeType` in `src/lib/canvas/node-data.ts`) already rejects an
unknown type with an error naming the real list, so the CLI package (which
cannot import `$lib` — see the app→CLI→MCP boundary in the root CLAUDE.md)
no longer carries a second, driftable copy of the type list.

Not done: no canvas-page UI action was added (the editor's own browser path
already covers the human flow, per the task's "optional"), and no Italian
"Effetti sulle immagini" guide section exists anywhere in the repo to add a
line to — searched `docs/`, `cli/skills/`, and every `.md`; nothing by that
name. `cli/skills/feega/SKILL.md` and `references/tools.md` (and their
plugin mirror) document `apply_effects` and the now-13 node types instead.
