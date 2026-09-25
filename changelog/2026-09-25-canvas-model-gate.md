# Canvas generation validates against the offered catalogue, not a role slot

Every newly-listed model in the canvas image/video menus (337eb904 offering every synced
`ai_models` row) failed with `model_not_for_slot`. `runImageJob`/`startVideo`
(`src/lib/server/media-generate.ts`) checked the chosen model with `slotAccepts` — the gate
built for the six `content_prefs` roles (`imageModel`, `videoModel`, ...), which only knows a
model through `IMAGE_MODEL_CHOICES`/`videoModelSpec(...)?.roles`. A model synced from OpenRouter
without a hand-written spec (Google: Nano Banana / Gemini 2.5 Flash Image, Alibaba: HappyHorse,
...) has no role to declare, so it was always refused — even though the menu itself, built from
`offerableModels` (`src/lib/server/offerable-models.ts`), had just offered it.

## What changed

- `src/lib/server/media-generate.ts` — new `canvasModelAccepts(admin, medium, model)`, checking
  the chosen model against `offerableModels(admin, medium).choices`, the same list the menu
  reads. `runImageJob` and `startVideo` now branch on `job.brandId === null` /
  `opts.brandId === null` (the canvas marker, set only by `generateImagesWithoutBrand` /
  `generateVideoWithoutBrand`): the canvas path validates against the offerable set, the
  brand/post path keeps `slotAccepts` exactly as before — a slot still means a MESTIERE
  (rigenera, anima), and `content_prefs` still needs a model that declares that role.
- A model that is NOT synced (absent from `offerableModels`) is still refused with
  `model_not_for_slot` — the gate doesn't disappear, it changes what it compares against.

## Verified

- `src/lib/server/media-generate.canvas-model-gate.test.ts` (new): an unspecced synced model
  reaches `renderPostImage`/`submitAndTrackVideoRender` with its wire id, for both image and
  video; a model absent from the synced catalogue is refused before either is called.
- `src/lib/server/media-generate.video-errors.test.ts` — updated to mock `offerable-models`
  (the file tests duration clamping, not the catalogue; the models it exercises are stubbed as
  offered so the new gate doesn't interfere).
- Live, on the real canvas (`/p/5ae78d0a-.../c/62bfe051-...`): retried the exact failing node —
  Google: Nano Banana (Gemini 2.5 Flash Image) — which had `node_runs.error = 'model_not_for_slot'`
  at 12:47:52 UTC. Two retries after the fix both landed `status: done, error: null`
  (`node_runs` `adaf7f4c`, `b9910599`), and `ai_calls` shows `google/gemini-2.5-flash-image`,
  `status: ok`, `$0.039154` each. A second live run on `alibaba/happyhorse-1.0` (video, 480p, a
  cheap unspecced model) also passed the gate and reached the provider — no `model_not_for_slot`
  — but the provider itself rejected the request: `Input should be '1080P' or '720P':
  parameters.resolution`. That's a real, separate defect (this model's OpenRouter wire format
  wants uppercase `720P`/`1080P`, not the product's lowercase `480p`/`720p`) — not something this
  fix claims to solve, and not hidden: the exclusion lives in `video_renders.error` for that run
  (`cb1de6e2`), one row, not a silently-broken menu entry.
