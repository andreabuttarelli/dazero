# Jev next-step suggestions on the canvas — phase 1

Ghost chips under a selected node, proposing what to do next. The port and adapter for Jev
(TypeSafe AI) plus the first use case that reads them.

## Why

A rules table alone can say what's *valid* for a node type, not what's *likely* — Jev re-ranks
the same validated set using the model's judgement, when a key is configured. Without one, the
feature degrades to rules + historical frequency, never throws, never blocks the canvas.

## Port and adapter

- `src/lib/canvas/decide.ts` — the port, in our own vocabulary (`boolean` / `choose-one` /
  `score`), never Jev's wire format. `Decide = (question, state) => Promise<Decision | null>`.
- `src/lib/server/jev.ts` — `decideWithJev` implements `Decide` via `@typesafe-ai/sdk`. Returns
  `null` on a missing `TYPESAFE_API_KEY`, a timeout (`JEV_TIMEOUT_MS = 5000`), a non-2xx, or any
  network error — never throws. Not wired into `logAiCall`: that function debits
  `credit_ledger` for any successful priced call, and this isn't a user-chargeable spend.

## Next-step suggestions

- `src/lib/canvas/next-step-actions.ts` — the fixed action table (`NEXT_STEP_ACTIONS`), keyed by
  the node types that actually exist on the canvas. `actionsFor(nodeType)` filters it.
- `src/lib/canvas/suggest-next-steps.ts` — `rankedFallback` ranks the valid set by historical
  frequency (rank-based confidence, `RANK_BASE_CONFIDENCE` decaying by `RANK_DECAY` per
  position — a frequency *share* across 5-6 actions is always small, so ranking on it directly
  would fail every threshold check). `suggestNextSteps` optionally re-ranks that SAME set with
  Jev; a Jev answer outside the fallback-validated ids is ignored, so Jev can never introduce an
  action the table didn't already allow. `NEXT_STEP_CONFIDENCE_THRESHOLD` filters the tail.
- `src/lib/server/next-step-stats.ts` — `actionFrequencyFor` reads `nodes_connections`/`nodes`
  (read-only) to build the frequency table for a source node type.

## Wired

- `+page.server.ts` action `suggestNextStep`: node id in, ranked suggestions out.
- `NextStepChips.svelte`: debounced (400ms) call on single-node selection, cancelled on
  reselection, chips rendered under the selection box. A click goes through the existing
  `connectNew` path (now takes an optional `prompt`), or `onCreatePost` for the `create-post`
  wiring.

## Verified

Logged in as the eval user, opened the real canvas, selected an image node, confirmed three
chips rendered ("Generate variants", "Resize for Stories", "Animate into a video"), clicked one,
confirmed a new connected image node landed with the template prompt and no generation ran, then
deleted it through the UI.

## Left for phase 2

`create-post` wiring only calls `onCreatePost`, unverified end to end here (verification stayed
on `connect-new` deliberately, to avoid triggering the post composer's own side effects). No MCP
tool yet — CLAUDE.md's rule is app → CLI → MCP, and this hasn't shipped in the app UI long enough
to justify one.
