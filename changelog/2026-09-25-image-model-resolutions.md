# Image resolutions come from each model, not one shared tier

Every image model that declared `resolution` among `supported_parameters` was
offered the same hardcoded `IMAGE_RESOLUTION_TIERS = ['1K', '2K', '4K']`
(`offerable-models.ts`). Wrong for most of the catalogue: Seedream 5 Lite
doesn't do 1K, Seedream 5 Pro and Qwen Image 3 Pro don't do 4K, Nano Banana 2
also has a 512 tier nobody offered.

## What was actually wrong, verified live against OpenRouter (2026-09-25)

- `GET /images/models` publishes `supported_parameters` as an object keyed by
  parameter name, `{type, values}` — not the flat array `chatOrImageRow`
  assumed for everything else. `resolution.values` is the per-model enum:
  Seedream 5 Lite `["2K","4K"]`, Seedream 5 Pro `["1K","2K"]`, Qwen Image 3 Pro
  `["1K","2K"]`, Nano Banana Pro `["1K","2K","4K"]`, Nano Banana 2
  `["512","1K","2K","4K"]`. The GPT Image family (2, 2.5 Sunburst, 2.5 Flare)
  has no `resolution` parameter at all — it takes `quality`
  (`auto|low|medium|high|xhigh|max`) instead, a different knob entirely.
- The request side (`POST /api/v1/images`, `openrouter-images-api.ts`) already
  forwarded `body.resolution` verbatim from `req.config.imageConfig.resolution`
  — that part was correct. Only the *offer* was wrong: users were shown tokens
  the chosen model would reject.

## What changed

- `ai-models-sync.ts` — `chatOrImageRow` now reads
  `supported_parameters.resolution.values` for the image catalogue and writes
  it into `ai_models.supported_resolutions` — the same column video already
  uses (same shape: a per-model string list), no new column.
- `offerable-models.ts` — `imageResolutionsFor` now reads the synced
  per-model list directly, dropping the shared `IMAGE_RESOLUTION_TIERS`
  constant. A model with an empty synced list (GPT Image, or sync not yet
  reached) offers no resolution selector at all, never an invented tier.
- `gen-node.ts` — `snapVideoResolution` renamed `snapResolution` (it never
  depended on the medium) and reused for image: switching a node's model
  snaps a resolution the new model doesn't serve to that model's first
  offered value, same as video already did.
- `gen-cost.ts` untouched: image pricing (`unitCredits`) already ignores
  resolution and OpenRouter has no per-resolution price to read, so no wrong
  number was ever at risk of being shown.

## Backfill note

Ran the sync (`GET /api/v1/ai-models/sync`) by hand against the live catalogue
so `supported_resolutions` is populated for existing image rows immediately,
rather than waiting for the next scheduled tick.

## Verified

Unit tests (`ai-models-sync.test.ts`, `offerable-models.test.ts`,
`gen-node.test.ts`) cover: the sync extraction from the nested
`supported_parameters.resolution.values` shape, per-model resolution offering
with three real fixture models (Seedream 5 Lite / Pro, Nano Banana 2) proving
distinct lists, the no-selector case for GPT Image, and resolution snap on
model switch. `openrouter-images-api.test.ts` already covered the wire
parameter/token passthrough — unchanged, still green.

Live: created an image node on `seedream-5-lite` through the real
`/api/v1/org/nodes/[id]/generate` path (same `runGenNode` the canvas UI
calls) at `4K` — the model's non-default resolution (`2K` is first). Output
landed at 4096×4096, confirming `4K` was actually sent and honored. Cost from
`ai_calls`: $0.035, `status: ok`. Test node deleted after.
