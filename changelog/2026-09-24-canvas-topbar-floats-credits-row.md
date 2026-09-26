# Canvas top bar floats over the canvas, with a credits row

The canvas used to start below a solid top bar (44px, border, background). Now the canvas fills
the whole viewport from y=0 and the top bar floats over it, transparent, so nothing is stolen
from the drawing surface.

## Top bar

- `CanvasTopBar.svelte` is now `position: absolute; inset-x: 0; top: 0` inside `.canvas-stage`
  (`+layout.svelte`), not a flex sibling above `.canvas-row` — the row that used to hold
  `canvas-row` after the bar now fills the whole shell height, and `.canvas-stage` (already
  `position: relative`) is the positioning parent.
- `pointer-events: none` on `.topbar`, `auto` on `.switchers`, `.chat-toggle` and `.credits`: the
  transparent strip above/between the switchers and the chat button no longer blocks panning or
  clicking a node underneath.
- Padding removed; background and bottom border removed (was `border-bottom` + `--paper`).
- `FloatingRail`, `CanvasSheet`, `CanvasChatPanel`, the selection bar and mobile chrome were not
  moved — they were already absolutely positioned or already outside the old bar's box, so
  nothing new needed offsetting once the bar stopped taking layout height.

## Credits row

- New row under the switchers, inside the same floating header: `{balance.toLocaleString()}
  credits`, linking to `/app/billing`.
- Balance comes from `orgCreditBalance` (`src/lib/server/credits.ts`, the `org_credit_balance`
  RPC — ledger grant minus debit, the same read `/app/billing` already uses), loaded in
  `src/routes/p/[projectId]/+layout.server.ts` next to `projects`/`canvases`/`brand`.
- The load calls `depends('app:credits')`. `run()` and `runLoop()` in the canvas page — the two
  client functions that call the `run`/`run_loop` actions, which gate and spend credits — call
  `invalidate('app:credits')` right after `refresh()`, so the balance shown updates once a
  generation (or a loop enqueue) has actually spent something.
