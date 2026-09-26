# Create a post from a canvas selection

## What changed

Selecting media on the canvas had no way in to a post: the calendar could only receive
one from elsewhere. "Crea post" is now a row in `selection-actions.ts`, gated by a new
`enabledFor` — a post needs at least one image or video, and `postCompositionFor`
(already used to read a selection's media/captions) already answers that.

`SelectionToolbar.svelte` disables an action and swaps its tooltip to the reason
instead of hiding it — the same pattern every future gated action can reuse.
`CanvasFlow.svelte`'s `SELECTION_RUN` is a `Record<SelectionActionId, ...>`, so adding
`create-post` forced the new arm at compile time; it forwards to `onCreatePost`, a new
optional prop.

The composer itself is a new sheet, `/p/[projectId]/create-post`, wired through the
same lazy-loaded, shallow-routed sheet system as Calendar/Ads (`sheet-pages.ts`,
`CanvasSheet.svelte`). Its `NAV_ENTRIES` row uses a `group: 'hidden'` — a group the
rail never iterates — because this sheet only opens from a canvas selection, never
from the rail.

It reads the selected node ids from `nodeIds` in the URL, resolves media through the
canvas's own signed-asset route, and submits to the canvas route's existing
`create_post` action (`createPostFromNodes`) rather than duplicating its node-scoping
and account-validation logic in a second place. Server error codes
(`brand_not_found`, `no_connected_accounts`, `accounts_not_found`, `node_not_found`,
`delivery_failed`, `brand_and_nodes_required`) map to copy through a single table,
`create-post-errors.ts`.

A node used by at least one post now shows a small marker next to its label on the
canvas (`CanvasTile.svelte`'s `inPost`), sourced from `listSourcesForNodes` in the
canvas route's `load`.

## Not wired in this change

`+page.svelte` under `c/[canvasId]/` was off-limits (a concurrent agent's file): the
`onCreatePost` callback on `<CanvasFlow>` and the `inPost` field on each tile still
need one line each there. See the PR/task notes for the exact snippets and confirmed
variable names.

## Test

`selection-actions.test.ts` (enabledFor), `create-post-composer.test.ts` (media
reorder/remove, default schedule time), `create-post-errors.test.ts` (every code has
copy, unknown code falls back).
