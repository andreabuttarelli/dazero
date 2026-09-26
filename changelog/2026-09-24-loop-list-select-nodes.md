# List and select nodes are now drawn on the canvas

Loop mode was built server-side (`src/lib/server/canvas/loop.ts`, `loop-plan.ts`,
the cron-drained queue, MCP tools `run_node_loop`/`preview_node_loop`/
`cancel_node_loop`, data schemas for `list`/`select` in
`src/lib/canvas/node-data.ts`, `nodes_connections.mode` fixed/iterate) but the
canvas page had no component for either type. A loop's output list was
invisible — two live `list` nodes existed with nothing rendering them — and a
user could not build a list to feed a loop's `iterate` input, or a select to
pick one item out of a list for a downstream node.

## What changed

Two new pure modules, `src/lib/canvas/list-node.ts` and
`src/lib/canvas/select-node.ts`, hold the client-side shape and editing logic
(add/remove/reorder items, `item_kind` exclusivity — image or text, never
mixed — and 1-based index clamping for select), each with its own test file.
`node-size.ts`'s `FALLBACK_SIZE` for `list`/`select` is now their real sizes.
`ListNode.svelte` and `SelectNode.svelte` render them: a list shows a
thumbnail or text line per item with a per-item status icon
(queued/running/done/failed) while a loop drains, accepts a drop of the same
`CANVAS_DRAG_FILLED_NODE` payload the asset library already sends, and lets
text items be added/removed/reordered by hand; a select shows the item at its
index with prev/next controls, resolving its upstream list the same way
`upstream.ts::listFeeding` does server-side (first incoming edge from a
`list`, client-mirrored in `select-node.ts::listFeedingSelect`).

`canvas-node-data.ts` gained `listOf`/`selectOf`/`listData`/`selectData` next
to the existing per-type readers, and `NODE_TYPES` there now includes both.
`addable.ts`/`addable-icons.ts` make `list` and `select` creatable from the
add bar and drag payload, same as any other node.

A failed loop item can be retried from its list node: a new
`retry_loop_combo` form action rereads the original iteration's values from
the matching `node_runs.params.loop` ticket (by `run_id`, falling back to
`label`) and calls the already-existing but never-wired
`loop.ts::retryLoopCombination`.

The `fixed`/`iterate` wire toggle had a server function
(`setConnectionMode`) and a data schema but no UI. `canvas-edges.ts` gained
`WIRE_MODES`/`WireMode`/`isWireMode`/`WIRE_MODE_LABEL` and `FlowEdge.mode`;
`CanvasFlow.svelte`'s edge-click panel now shows the toggle when
`onEdgeModeChange` is passed, and a new `set_edge_mode` action wires it to
`setConnectionMode`.

`list`/`select` output ports follow their item medium (`text`/`images`)
instead of a fixed connector — computed locally in `+page.svelte`
(`outputConnectorOfTile`) rather than in the shared `connectors.ts`, which
another concurrent change was mid-editing.

Traced: add list from the add bar → `create` action → `createNode` → drag an
asset onto the tile → `ListNode`'s `ondrop` → `write` action →
`writeNodeData` → wire `iterate` into an image node's edge → edge panel →
`set_edge_mode` → `setConnectionMode` → Loop button on the gen node →
`loop_plan`/`run_loop` (already wired) → `enqueueLoop` →
`createOutputList` → the new list node renders live via the existing
realtime-triggered `refresh()`.

MCP/CLI needed no changes: `insert_row`/`update_row` already validate against
`NODE_DATA_SCHEMAS`, which already covered `list`/`select` — the gap was the
canvas UI only.
