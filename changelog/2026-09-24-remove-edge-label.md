# Wires stop drawing a label on the line

Every canvas edge carried a `label` — `«nasce da»` (derives_from), `«risponde a»`
(responds_to), `«insieme a»` (groups_with) — drawn by SvelteFlow on the wire itself
(`--xy-edge-label-*`). The user wants a mute line.

## What changed

`FlowEdge.label` is gone (the field is no longer populated by either place that builds
one: `+page.svelte::toEdge`, the live path, and `canvas-edges.ts::toFlowEdges`, kept
in step even though nothing calls it outside its own test). SvelteFlow draws no label
when the field is absent. The `--xy-edge-label-background-color`/`--xy-edge-label-color`
CSS vars in `CanvasFlow.svelte` styled only that label — dead once it stopped being
drawn, removed with it.

**`EDGE_KIND_LABEL` and the three edge kinds stay.** The click-to-open edge menu
(`CanvasFlow.svelte`'s `edge-panel`, opened by `onEdgeClick`) still needs the kind
names to let someone retype an edge — that's the one place `EDGE_KIND_LABEL` is read
now. `+page.svelte` dropped its now-unused import of it.
