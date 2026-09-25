# Mount the Composizione node on the canvas

Phase 1 (79b06afe..e0303c78, same branch) built the node type end to end at
the schema/graph/connector level, the `CompositionNode`/`CompositionEditor`
components, and the pure `composition-node.ts`/`composition-editor.ts`
modules — but nothing on the canvas page created one, rendered its tile, or
opened its editor. `newNodeRow` had no `composition` branch either, so
adding one from the bar would have written `undefined` fields.

## What changed

- `addable.ts`/`addable-icons.ts` — `composition` joins `CANVAS_ADDABLE`
  with label "Composizione" and the `Orbit` icon (`node-label.ts` already
  used both for the existing-node case; the addable surfaces didn't).
- `canvas-node-data.ts::newNodeRow` — a `composition` branch mirroring the
  defaults already declared for reads (`compositionOf`'s
  `DEFAULT_COMPOSITION_*` constants): `tilted-grid` layout, `slow-orbit`
  camera, black background, 6s duration, 9:16.
- Canvas page (`+page.svelte`):
  - `composition` gets an input connector type (`['images']`), same as
    `effects` — it takes several image inputs, not the single upstream ref
    a gen node reads.
  - Tile branch mounts `CompositionNode`, fed by `upstreamImageRefs` (the
    reusable resolver `composition-node.ts` already exported, unused until
    now — same upstream-image-walk `effects-node.ts::upstreamImageRef`
    does, generalized to many refs).
  - `CompositionEditor.svelte` is imported dynamically (`import()`) on
    first open, not at module load: the canvas page keeps zero Three.js in
    its own bundle, and the editor component itself already lazy-imports
    `composition/scene.ts` a second time for the same reason.
  - Save writes `compositionData(next)` through `write` with the standard
    `node_id`/`version` concurrency check the `write` form action already
    enforces server-side (`writeNodeData`, `conflict` on a stale version) —
    no new server code, just the same POST every other node type uses.

## Discarded

A partial `write()` merge (like every other node type uses via the local
`write(id, patch)` helper) instead of a dedicated `saveComposition`: the
editor batches every field into one save on an explicit click rather than
per-field like a text input, so a direct `post('write', …)` call reads
clearer than routing a single big patch through the optimistic merge
helper built for per-keystroke writes.
