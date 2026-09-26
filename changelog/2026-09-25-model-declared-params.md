# Every model-specific parameter, as OpenRouter declares it

Phase 1 (cb221d68) synced each model's declared param schema into
`ai_models.param_schema` — GPT Image 2.5 carries `quality`/`background`/
`output_compression`, video models carry `generate_audio`/`seed` — but
nothing read it yet. The toolbar only ever showed the handful of fields we'd
hardcoded (`aspectRatio`, `duration`, `resolution`, `audio`, `repeat`), so a
GPT Image render could never ask for anything cheaper than the model's
default quality, and no image model's `background`/`output_compression`
were reachable at all.

## What changed

- `model-params.ts` (new) — `modelParamsOf(schema)` turns a raw
  `param_schema` into the `ModelParam[]` the toolbar renders, driven by ONE
  exclusion table with a reason per row: `aspect_ratio`/`resolution`/
  `duration` already have dedicated controls, `input_references` is wiring
  not a user setting, `n` is always 1, and `generate_audio` is the wire name
  behind the existing `audio` field (`ModelChoice.generateAudio`) — kept as
  one control, not two that could drift apart.
- `offerable-models.ts` — `ModelChoice.params` is now set from the synced
  row's `param_schema` for every image and video choice, specced or generic.
- `SelectionToolbar.svelte` — one generic renderer for `choice.params`: enum
  becomes a select, boolean a toggle, number a bounded input. No per-param
  branch — a model with a field nobody has seen before shows up without
  touching this file. `common-properties.ts::dynamicParamsOf` extends the
  existing same/mixed/unset logic to an arbitrary list of param names
  instead of a fixed field list, so Mixed still works correctly across a
  multi-node selection with different values.
- Values round-trip through `nodes.data.params.<name>` via the existing
  `batchWrite` path (`commonChange`'s `dynamicParams` bucket) — no new
  storage shape.
- `extraParamsOf` filters what actually reaches the provider: only the names
  the *currently chosen* model declares, so a value left over from a
  previous model, or a name no model ever declared, never reaches the wire.
  Wired at the HTTP boundary in `openrouter-images-api.ts` and
  `openrouter-video.ts`.
- `snapDynamicParams` mirrors `snapResolution` for these fields on a model
  switch: an enum value the new model doesn't offer falls to its first
  value, a name the new model doesn't declare at all is dropped, number and
  boolean pass through unchanged (they have no closed list to fall out of).
- Cost (`gen-cost.ts`): left untouched. `ai_models.pricing` doesn't document
  per-value pricing tiers (no `quality`-scaled price appears anywhere in the
  synced rows) — inventing a multiplier would be the same wrong number this
  file already refuses to guess for resolution.

## Verified

Unit tests: `model-params.test.ts` (13, fixtures on GPT Image 2.5, a
Seedream, a video schema), `offerable-models.test.ts` (params carried per
choice), `common-properties.test.ts` (`dynamicParamsOf` same/mixed/unset),
`openrouter-images-api.test.ts`/generate.ts's own suite (params reach the
request body, generic image/video paths). Full suite green (5504 passed,
one pre-existing Bun-only CLI test unrelated to this change).

Live: created an image node on `gpt-image-2.5-sunburst` through the real
`/api/v1/org/nodes/[id]/generate` path (same `runGenNode` the canvas UI
calls) with `quality: "low"` — the model's cheapest tier. The image landed
(1024×1024 PNG, verified via a signed storage URL, HTTP 200). Cost from
`ai_calls`: $0.01422, `status: ok`, confirming `quality: "low"` reached
OpenRouter rather than the model's default. Test node, run and asset deleted
after.
