# One bar for a selection, not three

Selecting a generation node showed TWO floating overlays at once: the node's own
properties (model, aspect ratio, duration, audio — `GenNode.svelte`, only when
`selected`) and the selection toolbar with the command icons
(`SelectionToolbar.svelte`, driven by `selection-actions.ts`). With 2+ nodes
selected a THIRD overlay stacked above the toolbar (`CommonPropertiesPanel.svelte`,
fed by `common-properties.ts`). Three floating boxes anchored to the same
selection, each recomputing its own position, drifted apart at every zoom level.

## What changed

`SelectionToolbar.svelte` is now the only bar. Left side: the property controls
for the selection. Right side: the command icons, unchanged. `CommonPropertiesPanel.svelte`
is deleted; `GenNode.svelte` no longer renders a `selected`-only header — it keeps
the prompt textarea, the generate/loop buttons, the result and the run history,
nothing else moved.

**One field table, not two panels agreeing by convention.** `common-properties.ts`
had `model`/`aspectRatio` for the multi-select case only; it now has `GEN_FIELDS`,
a table of `{ id, appliesTo(type), read(node) }` for `model`, `aspectRatio`,
`duration`, `audio`, `repeat` — the same fields `GenNode.svelte`'s old header
exposed. `commonPropertiesOf(nodes)` reads this table for BOTH cases: with one
node the "common" value of a one-element array is just that node's value
(`{ kind: 'same', value }`), so a single selection and a five-node selection are
the same function call, not two definitions that could drift. `Mixed` still only
appears with 2+ nodes — `commonOf` on one element never disagrees with itself.

**No new write path.** The bar's `onpropertychange` still calls `commonChange`
in `+page.svelte` (now `onPropertyChange` on `CanvasFlow`), extended to also
carry `duration`/`audio`/`repeat` alongside `model`/`aspectRatio` — one or many
node ids, same `batchWrite` server action, same per-node optimistic concurrency
on `nodes.version`, same `orphanedByModelChange` confirmation before a model
change drops a wire. A single selected node now goes through the exact function
a multi-selection already used; before this change a single node's model change
bypassed the orphan check entirely (`write()` had no such confirmation) — now it
gets the same guarantee.

**Discarded**: keeping `GenNode`'s header for a single node and only removing
the separate multi-select panel. Rejected because it would leave the field
definitions in two places (the header's inline JSX-like markup, and
`common-properties.ts`'s table) that a future field would have to update in
both, silently, or diverge.
