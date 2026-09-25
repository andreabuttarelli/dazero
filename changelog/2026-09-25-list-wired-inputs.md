# Lists fed by wires

A `list` node was filled only by drag-and-drop or typed lines, and `canConnect` refused any wire
into it (`list` was not in `CANVAS_NODE_SPECS`, so it fell to "tipo sconosciuto").

## What changed

- `list-node.ts::listValues` is the single answer for what a list carries: manual items, then
  the live output of each wired node in wire order (`wiresInto`, by edge id — the order of
  `upstream-inputs.ts::incomingEdges`). A wired node with no output is `pending`: shown as a
  placeholder, never counted. A wire of the other medium is ignored.
- Port: `listConnectors(listKindOf(...))` — `images` for an image list, `text` for a text list,
  both while the list is empty and unwired; the first wire decides the kind. Every port of a list
  takes many wires (`portListValued`), text included. `CanvasFlow` now refuses a wire no port
  accepts (`anyPortAccepts`) instead of landing it on a port of the wrong medium.
- Server: `upstream.ts::resolvedListValues` resolves wired sources (refId asset for images,
  `sourceText` for text) and feeds `listValues`. Fixed wires, loop iterations (`itemAt`),
  `select`, and `loop.ts::axesForNode` all read it; nobody reads `data.items` alone any more.
- Client: the canvas page computes `listValuesByNode` with the same function; the tile, the
  `select` preview, the output port kind and `loopAffordance` counts use it.

## Decisions

- Kind is not persisted when the first wire lands: it is derived every time. Writing
  `item_kind` on connect would be a second write that can drift from the wires.
- Wired items are not copied into `items`: they would go stale when the source regenerates.
- Discarded: letting video nodes feed a list — `item_kind` is image or text only.
