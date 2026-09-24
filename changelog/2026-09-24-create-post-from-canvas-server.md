# Create a post from a canvas selection — server side, phase 1 of 2

Server-only groundwork for turning a canvas selection into a post, draft or scheduled. No UI yet
— a later change builds the composer sheet on top of this.

## `createPostFromNodes` (`src/lib/server/repos/create-post-from-nodes.ts`)

`createPostFromNodes(db, repos, { orgId, userId, brandId, nodeIds, caption, accountIds, mode },
publisher)`, `mode: { kind: 'draft' } | { kind: 'schedule'; at: ISO string }` — a discriminated
union, not a boolean, because "scheduled" carries a time a `true`/`false` can't.

Not a parallel path: it calls `promoteNodesToPost` (`post-from-nodes.ts`, already used by
`POST /api/v1/org/posts` and the `create_post` MCP tool) for the promotion, and `scheduleDelivery`
(`post-delivery.ts`, the same function the calendar's `schedule`/`publishNow` actions call) for
the Zernio path. `promoteNodesToPost` now takes an optional `caption` override — the composer
chooses the caption, node text is a source, not a second caption concatenated onto the chosen one.

Refusals, never a half-built post: `brand_not_found` (brand doesn't belong to the org),
`no_connected_accounts` (brand has no `social_accounts` row at all — scheduling only, a draft
never checks this), `accounts_not_found` (none of the requested account ids belong to this
brand), `node_not_found` (from `promoteNodesToPost`, a node in the selection doesn't resolve to
an org node with output), `delivery_failed` (every Zernio delivery failed — the post exists as a
draft but never flips to `ready`, so it doesn't read as scheduled when it isn't).

## `postCompositionFor` (`src/lib/canvas/post-composition.ts`)

Pure helper for the UI: `postCompositionFor(nodes)` → `{ media, captions, enabled }` from
selected node summaries. Image/video nodes contribute `assetId` (uploaded via `data.assetId`,
generated via `data.output_asset_id` only when `data.status === 'done'`); text nodes contribute
their generated output if done, else their prompt; doc nodes contribute their content.
`enabled` is true only when at least one node contributes media — a caption alone is not
publishable.

## `create_post` form action

Added to `src/routes/p/[projectId]/c/[canvasId]/+page.server.ts`, additively (another agent was
live on the same file for an unrelated change — the diff is a pure addition, no existing lines
touched). Reads `brand_id`, `caption`, repeated `node_id`, repeated `account_id`,
`scheduled_for` from form data; empty `scheduled_for` means `draft`, otherwise `schedule`.

No brands+accounts endpoint was added for the composer — deferred to the UI phase, which will
say whether a `load` addition or a dedicated `GET /api/v1/org/brands` fits its shape better.
