# Every synced model offered, video/image resolution wired end to end

Before this run, image/video pickers only offered the families we had hand-written a spec
for in `image-models.ts`/`video-models.ts` — a handful out of the 52 image and 29 video
models OpenRouter actually syncs into `ai_models`. Video duration was a single hardcoded
step, and neither medium had a resolution control even though both providers support one.

## What changed (5213e6dd…337eb904, then this work)

- `video-models.ts` — per-model video duration steps (`durations`), replacing one product-wide
  default.
- `SelectionToolbar.svelte` — duration and resolution selects, generic across media
  (`ModelChoice.durationOptions`/`resolutions`), not video-only despite landing there first.
- `offerable-models.ts` — `offerableModels` now offers every synced `ai_models` row for a
  medium, not just the ones a hand-written spec recognizes. A specced model is enriched
  (aspect ratios, refs budget, measured price); an unspecced one gets the conservative
  `genericImageChoice`/`genericVideoChoice` fallback (1:1 only, `MIN_DURATION`, no
  `unitCredits`) instead of being hidden. "The app leads" (CLAUDE.md): follow the catalogue,
  don't gate it to what we wrote by hand.

## This session

**Unspecced video models couldn't actually render.** The menu offered them (337eb904) but
`openrouterVideoModel` (`openrouter-video.ts`) called `videoModelSpec(id)?.openrouterId` and
returned `undefined` for anything without a spec — `submitOpenrouterVideo` failed before the
provider ever saw the request. Fixed the same way `generateImageOnOpenrouterImages` already
handles unspecced images: fall back to the incoming id, which is already the wire id for a
model with no spec (`offerableModels` never translates one). Dead "not in catalogue" branches
removed now that the lookup can't return `undefined`.

**Resolution now scales the video cost estimate.** `creditsForRun` (`gen-cost.ts`) only scaled
with duration; 720p bills exactly 2x 480p (measured, `video.ts`), so it now applies a
`RESOLUTION_MULTIPLIERS` table (`480p: 1, 720p: 2`) scoped to `medium === 'video'`.

**Image nodes had no resolution control despite several models supporting one.** Checked
OpenRouter's `/api/v1/images` docs (openrouter.ai/blog/announcements/image-api) and the synced
`ai_models.supported_parameters` column: models that declare `"resolution"` there (Seedream
4.5/5, Gemini 3 family, Qwen Image 3, Riverflow, Grok Imagine — checked 2026-09-25) accept the
same three-tier enum, `"1K" | "2K" | "4K"`. `offerableModels('image')` now sets
`ModelChoice.resolutions` for those models; the toolbar's resolution select already worked for
any medium, it just never had image data to show. The choice reaches the provider: canvas
`generate.ts` → `ImageJob.resolution` → `buildImageRequest`'s
`config.imageConfig.resolution` → `generateImageOnOpenrouterImages`'s request body as
`resolution`, the field name `/api/v1/images` documents (not a chat-completions
`image_config`/`modalities` path — current docs don't describe one for image generation).

No cost multiplier for image resolution: every synced image model has empty `pricing`
(0 of 52 priced, checked via a read-only query), so there's no documented per-size price to
compute a multiplier from. `gen-cost.ts`'s multiplier stays video-only, where the 2x is
measured, not guessed.

## Verified

Unit tests at the boundaries that changed: `openrouter-video.test.ts` (unspecced model submits
with the incoming id), `gen-cost.test.ts` (resolution multiplier, video-only), 
`offerable-models.test.ts` (resolution offered only when `supported_parameters` lists it),
`openrouter-images-api.test.ts` and `media-generate.images.build-request.test.ts` (resolution
reaches the request body), `canvas/generate.test.ts` (`params.resolution` reaches
`generateImagesWithoutBrand`/`generateVideoWithoutBrand`).
