# Nodes resize from their edges and corners

Every node had a fixed size from its type (`node-size.ts`), except text,
which could only grow on its own (`text-node-grow.ts`). Nothing let a person
resize a node by hand.

## The pieces

`@xyflow/svelte`'s `NodeResizer` draws the eight controls (four edges as
lines, four corners as square handles — `handleStyle`/`lineStyle` set
`border-radius: 0`, the canvas's own rule). `CanvasTile.svelte` renders it
when the node is selected and its tile carries a `minW`/`minH` — a tile
without those (the brand recap, or anything the page doesn't mark
resizable) never shows a resizer, the same "assente = spento" convention
every other optional tile field already follows.

The callback needed to reach `CanvasTile` without adding a prop that every
node type would otherwise thread through `nodeTypes`, so it followed the
existing `tile-render-context.ts` shape: a new `tile-resize-context.ts`
holds a context set once by `CanvasFlow.svelte` (`onResize` prop) and read
by every tile.

`node-size.ts` already had one size per type; the page's `tiles` derived
now passes `nodeSize(n.type)` as `minW`/`minH` — a node can grow past its
type's floor, never shrink under it.

## Persisting it

`resizeNode` already existed in `repos/canvas.ts`, unused since it was
written — last-write-wins, no `canvas_events`, the exact contract the file's
own top comment already declared for it alongside `moveNode`. A `resize`
action in `+page.server.ts` mirrors `move`: parses `width`/`height`, clamps
them to the node type's floor server-side too (never trust the client's
minimum), and writes. The page's `resize()` function is `move`'s shape:
optimistic, reverted if the server rejects.

Resizing a text node also sets `userHeight` — the same field
`grownTextNodeHeight` already reads to mean "the user chose this, stop
growing it automatically." A hand-picked size wins over auto-grow, by design
already written into `text-node-grow.ts`; this is the first path that
actually sets it from the UI.

## Left out, on purpose

No undo-stack entry: `MoveGesture` only carries `x`/`y`, and giving resize
its own gesture kind for one gesture is the complexity `CLAUDE.md` argues
against paying before it's needed. Ctrl+Z on a resize is left for later if
it turns out to matter.

## Verified

Dev server, real browser: created a text node, selected it, dragged the
bottom-right handle — 8 resize controls, the node grew, and the new size
survived a page reload (proof the `resize` action actually wrote).
