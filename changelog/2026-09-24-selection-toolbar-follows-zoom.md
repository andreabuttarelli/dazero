# The selection toolbar scales with zoom instead of covering nodes

`SelectionToolbar.svelte` lives outside `SvelteFlow` (`CanvasFlow.svelte`), anchored
with screen-space `position: fixed` coordinates that `CanvasSelectionBridge.svelte`
projects from `getNodesBounds`. It never inherited the `transform: scale()` SvelteFlow
applies to `.svelte-flow__viewport`, unlike the node label and port names in
`CanvasTile.svelte`, which live inside that viewport and already shrink correctly with
zoom (checked while diagnosing this — no fix needed there). Zoomed far out, the toolbar
kept its screen size and covered the shrunk nodes underneath.

## What changed

`CanvasSelectionBridge` now also reports `viewport.current.zoom` (`useViewport`)
alongside `box`. `SelectionToolbar` applies `toolbarScale(zoom)` as a second
`transform: scale()`, anchored at the same point its existing `translate` already
anchors to (`transform-origin: center bottom`), so it shrinks toward the node instead
of drifting off it.

The clamp and hide threshold are pure functions in
`src/lib/canvas/toolbar-scale.ts` (`toolbarScale`, `TOOLBAR_MIN_SCALE` 0.5,
`TOOLBAR_MAX_SCALE` 1, `TOOLBAR_HIDE_BELOW_ZOOM` 0.2, below which the bar hides
entirely rather than sit at minimum size over unreadable nodes), tested first
(`toolbar-scale.test.ts`) — same shape as the existing `iframe-scale.ts` precedent for
embedded-page scaling.

Dropdowns (bits-ui `DropdownMenu`) portal to `<body>`, outside the scaled `.toolbar`
element, so they keep opening at full, readable size regardless of the bar's scale.

**Pre-existing, unrelated:** `multi-select-wiring.test.ts` was already red before this
change — it scrapes `CanvasFlow.svelte` for `selectionOnDrag`/`selectionMode` inside
the `<SvelteFlow>` tag and those props aren't there. Not touched here.
