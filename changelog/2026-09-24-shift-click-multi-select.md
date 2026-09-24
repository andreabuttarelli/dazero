# Shift-click adds a node to the selection, not only ⌘/Ctrl-click

The canvas guide (`selezione-e-scorciatoie.guide.ts`) already documented
"Shift-click **or** ⌘/Ctrl-click" as equivalent ways to extend a selection —
but only ⌘/Ctrl worked. xyflow's `multiSelectionKey` prop defaults to a
single key (`Meta` on macOS, `Control` elsewhere, `KeyHandler.svelte` in
`@xyflow/svelte`); Shift was never wired to it, so a Shift-click behaved like
a plain click and replaced the selection instead of extending it.

`<SvelteFlow>` in `CanvasFlow.svelte` now passes
`multiSelectionKey={['Meta', 'Control', 'Shift']}` — the prop accepts an
array in `@xyflow/svelte` 1.6, and any one of the three now toggles a node
into or out of the current selection.

`shortcuts.ts` doesn't list this gesture (it documents the canvas's own
keyboard shortcuts, not mouse gestures), so nothing there needed to change.
The guide text was already correct — the code is what caught up to it.

Verified against the real dev server: creating two nodes, clicking the
first, then Shift-clicking the second, leaves both selected
(`.svelte-flow__node.selected` count 2).
