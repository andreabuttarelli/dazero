# Genera/Loop show the "Migliora prompt" cost

The switch (commit `80e63dbb`) rewrote the prompt on the server but the price
Genera/Loop showed never included it: turning it on spends one extra chat-model
call (`prompt-enhance.ts::enhancePrompt`) and the estimate stayed the render's
price alone.

## What changed

- `MediumCatalogue` (`canvas-catalogue.ts`) gained `enhanceUnitCredits`, sent
  once per medium (image/video) alongside the model list — not per model,
  because the rewrite always runs on the same craft model
  (`craft-model.ts::craftAgentModel`), never the render model. Priced at
  `TEXT_NODE_CREDITS`: the rewrite is one free-form chat generation, the same
  unit `content-cost.ts` already uses for a text node — no second tariff to
  keep in sync.
- `gen-cost.ts::RunCostInput` gained `enhanceUnitCredits`. `creditsForRun` adds
  it to the estimate only when `params.enhancePrompt` is on; `creditsForLoop`
  inherits it per run, since a loop pays the rewrite once per combination, not
  once total. Missing `enhanceUnitCredits` keeps the base estimate — never an
  invented extra.
- `GenNode.svelte` takes the new prop from the page
  (`+page.svelte`'s `mediumCatalogue[gen.medium].enhanceUnitCredits`) and
  passes it into both `creditsForRun`/`creditsForLoop` calls that back the
  Genera/Loop buttons.

`prompt-enhance.ts` itself is untouched — this only prices what it already
does.

## Verified

Unit: `gen-cost.test.ts` — extra added only with the switch on, no extra when
the enhance cost is unknown, a video's scaled price plus the flat rewrite
cost, and a loop multiplying the rewrite cost per combination.

Live: `POST /api/v1/prompts/enhance` on `nano-banana-2-lite` rewrote "un gatto
su un divano" into a full craft brief (see commit for before/after). One real
`POST /api/v1/org/nodes/{id}/generate` with `enhancePrompt: true` on the same
model: `node_runs.prompt` held the rewritten brief, `nodes.data.prompt` stayed
the original short prompt, cost $0.034079 / 7 credits in `ai_calls` for the
render. Note: `enhancePrompt`'s own chat call does not log its own `ai_calls`
row today — `prompt-enhance.ts` calls `generateText` directly, outside
`withOrgContext`/`ai-log.ts` — so `enhanceUnitCredits` is an estimate shown
before the run, not yet a cost reconciled against a logged call. Test project,
canvas, node, run and the generated storage object were deleted after
verifying.
