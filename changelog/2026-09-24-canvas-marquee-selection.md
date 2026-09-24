# Marquee, group move and the selection toolbar are now reachable

The pieces existed — `CanvasSelectionBridge.svelte`, `SelectionToolbar.svelte` with
`commonPropertiesOf`/"Mixed", `selection-actions.ts`, duplicate/copy/paste/delete in
`CanvasKeys`, `batchWrite`, and `onNodeDragStop` already saving every dragged node —
but nobody could reach them: `<SvelteFlow>` in `CanvasFlow.svelte` never turned on
drag-to-marquee. SvelteFlow's own default is `selectionOnDrag={false}`, so a drag on
empty canvas fell through to `panOnDrag`'s default (left-click pans) and no selection
box ever appeared. Shift+click, ⌘+click, ⌘A, group-drag-saves-all and the toolbar's
patch-to-all-selected were all already correct — they depend on `node.selected`, which
SvelteFlow itself maintains once a marquee (or any multi-select gesture) can happen at
all.

## What changed

`CanvasFlow.svelte`'s `<SvelteFlow>` now sets:

- `selectionOnDrag` — a drag starting on empty canvas opens the marquee.
- `selectionMode={SelectionMode.Partial}` — a node only partly inside the box is still
  selected; a Figma-speed gesture rarely fully encloses the target on the first drag.
- `panOnDrag={[1, 2]}` — panning moves to the middle (1) and right (2) mouse buttons,
  leaving the left button free for the marquee. `panOnScroll` (two-finger scroll) and
  the library's default `panActivationKey` (Space+drag) were already on and needed no
  change.

`selectionKey`/`multiSelectionKey` (shift/⌘ toggle-select) and `⌘A` (`select-all` in
`shortcuts.ts`, already wired through `CanvasKeys`) needed no change — their defaults
already matched the target behavior and were simply unreachable without a working
marquee to build a multi-selection from in the first place.

Not touched: `nodrag`/`nopan` classes on inner node controls (textarea, buttons in
`GenNode`/`DocNode`/etc.) — none exist in the codebase today, and SvelteFlow's node
drag only starts from a `mousedown` on the node body, not from a click inside an inner
control, so text selection and button clicks inside a node were never actually broken
by this. Left as-is; a real defect there would need its own reproducing test.

New test: `src/lib/canvas/multi-select-wiring.test.ts`, scraping the `<SvelteFlow>` tag
the same way `keys-mount.test.ts` already does for the same reason — the library's
Svelte context can't be mounted standalone in vitest, so the source shape is the
contract that's checkable outside a browser.
