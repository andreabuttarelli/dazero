# One selection border for every node type, and a new node arrives selected

Two related gaps in the canvas selection UX, closed together because the second
built directly on the first.

## Selection border, once, in the wrapper

Only `GenNode` drew a border when selected (`.gen.is-chosen`, purple, fixed
color) — every other node type (doc, iframe, products, social feed, influencer,
list, select, uploaded) showed no selection feedback at all beyond xyflow's own
faint outline.

`CanvasTile.svelte` already receives `selected` from xyflow and already knows
the node's output connector (`tile.output`, the same value that colors its
port handle via `CONNECTOR_STYLE` in `connectors.ts`). So the border moved
there: an absolutely-positioned `.tile-selection` overlay (`inset: 0`,
`outline`, no `border-radius`) drawn once, colored from `CONNECTOR_STYLE` when
the node has an output type, falling back to `var(--accent)` for the types
that don't (iframe, products, social feed — the same "arredo, non contenuto"
distinction the two-Handle comment at the top of the file already draws).

`GenNode`'s own `.gen.is-chosen` rule and its `selected` prop are gone — the
page no longer passes `selected` into it. One look, one place that decides it.

## A newly created node is selected by default

Every creation path optimistically appends to the page's `nodes` array —
`create` (add bar), `createFilled` (drag from assets/brands/influencer
panels), `connectNew` ("Collega a nuovo…"), `duplicate`, `paste`, and `upload`
all call `toTile(created)` and splice the result in. `toTile` gained a second
argument, `{ select?: boolean }`, and every one of those six call sites now
passes `{ select: true }`.

The flag rides the page's `Tile` → `CanvasFlow.svelte`'s `Tile` → `toNode` →
xyflow's `Node.selected`, consumed once by `syncNodes` (`tile-sync.ts`):
a freshly `added` node carrying `selected: true` clears `selected` on every
node already in xyflow's own state (the "kept" set) — the gesture is "select
this, not also whatever was selected before", the same as clicking a node.

`toTile` from `refresh()`/the initial `$effect`/realtime `onChange` never
passes `{ select: true }` — a snapshot re-read never re-selects anything, and
a peer's insert (which arrives through the same `refresh()` path) never steals
the local selection. `syncNodes` only reads `selected` off nodes it is about
to *add*; a tile that already exists locally is never re-selected by a later
sync, so there's no path from "another user created a node" to "it becomes
selected on my screen" — `select` simply isn't set on that tile.

## Test

`tile-sync.test.ts` gained three cases: a new selected tile arrives selected;
it clears selection off nodes already kept; and a plain realtime insert
(no `select`) never touches an existing selection. Verified once against the
real dev server: add-bar → new text node lands with the blue outline
(`CONNECTOR_STYLE.text.color`) and is the only `.svelte-flow__node.selected`.
