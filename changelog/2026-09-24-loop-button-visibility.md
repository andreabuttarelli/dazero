# Loop button only shows when a loop is possible

The Loop button on `GenNode.svelte` always rendered, wired to `runLoop`
(`+page.svelte`) regardless of whether the node had any `iterate` wire. A
node with no axis, or one axis of a single value, showed a button that would
run `loop_plan`/`run_loop` for a "loop" of exactly one combination — same
result as the plain Generate button, with none of the framing.

## What changed

`loop-axes.ts` gained `loopAffordance(targetId, edges, nodesById)`, reusing
`axesFrom` (already the source of truth for which `iterate` wires count as
axes — only a `list` with >=1 item). It multiplies each axis's value count
and returns `{ visible, combinationCount }`: `visible` is true only when at
least one axis exists AND the product is >=2 — a single-value axis is not a
loop. No cartesian-product logic duplicated: `axesFrom` and the product
reduction are the same building blocks `loop-plan.ts::cartesian` uses to
actually run the loop, just not executed here.

`+page.svelte` computes `loopSourceNodesById` (nodes + `list` item counts via
`listOf`) and `loopAffordanceByNode`, then passes `loopVisible`/
`loopCombinationCount` into `GenNode`. The button's `{:else if onrunloop}`
branch gained `&& loopVisible`, and its label is now `Loop ×{loopCombinationCount}`.

## b49716f4 finding — not acted on here

The loop design (`2026-09-23-loop-mode.md`) does NOT say a wire from a
`list` into a gen node should default to `mode: 'iterate'` in
`nodes_connections` — the default is `fixed` everywhere
(`repos/canvas.ts::createConnection`, `mode: input.mode ?? 'fixed'`), and
switching a wire to `iterate` is an explicit user action via the edge-click
panel (`set_edge_mode` → `setConnectionMode`). This matches the design as
written; nothing was changed here.
