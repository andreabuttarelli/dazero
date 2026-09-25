# Genera and Loop show their credit cost

CLAUDE.md asks the node to show how many credits a run costs before the click; nothing read the
price before now — the button just said "Genera" or "Loop ×N".

## What changed

- `gen-cost.ts` (new, `$lib/canvas`, pure): `creditsForRun({ medium, model, params })` — the
  credits for one run, reading `ModelChoice.unitCredits`, `null` when unpriced. `creditsForLoop`
  multiplies by combination count, `null` the same way. Video scales `unitCredits` (measured at
  `minDuration`) linearly by `params.duration / minDuration` — no `duration` or no `minDuration`
  known, price stays flat at the measured value, never guessed.
- `ModelChoice.unitCredits` (new, optional): the price for one run of that model, computed once
  server-side through the same `content-cost.ts` (`billedCreditsFor`) that `loop-cost.ts` already
  uses — never a second price table. Filled in `offerable-models.ts` (image: `IMAGE_CREDITS`,
  video: `videoCredits(spec.id)`) and `canvas-catalogue.ts` (text: `TEXT_NODE_CREDITS`).
- `GenNode.svelte`: "Genera · ~N cr" / "Loop ×N · ~N cr" when the resolved model has a price;
  unchanged label when it doesn't.

## Why the price travels instead of getting recomputed client-side

The client has the model catalogue (aspect ratios, durations) already, but not the credit rates
(`billedCreditsFor`, `content-cost.ts`'s measured USD table) — those are server-only. Sending the
per-model unit price alongside the catalogue choice avoids a second, client-side price table that
would drift from the server one the first time a rate changes.
