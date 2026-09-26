# Video resolutions come from each model, not one shared pair

Every video model was offered the same `VIDEO_RESOLUTIONS = ['480p', '720p']`
(`video.ts`, read by `offerable-models.ts`'s `videoChoice`/`genericVideoChoice`). Live:
`alibaba/happyhorse-1.0` rejected a render — `Input should be '1080P' or '720P'`
(`video_renders` `cb1de6e2`). Wrong set (happyhorse doesn't do 480p) and, per the error
text, wrong casing.

## What was actually wrong, verified live against OpenRouter (2026-09-25)

- `GET /videos/models` publishes `supported_resolutions` per model (lowercase tokens:
  `480p`, `720p`, `1080p`, `4K`…) — confirmed for every model we integrate
  (`happyhorse-1.0`/`1.1`: `["720p", "1080p"]`, never `480p`; Seedance 2.x:
  `["480p", "720p"]`; Grok Imagine 1.5: all three). Our sync (`ai-models-sync.ts`)
  never captured this field — `supported_parameters` was always hardcoded to `[]` for
  the video catalogue.
- `POST /videos`'s actual validator (hit live with a bogus token) accepts exactly
  `360p|480p|720p|768p|1080p|1K|2K|4K`, all lowercase except the K-suffixed trio —
  never the uppercase `1080P`/`720P` the defect quoted. That message likely came from
  a different/older validation layer; the ground truth is this Zod enum.

## What changed

- `20260925120000_ai_models_video_resolutions.sql` — `ai_models.supported_resolutions
  text[]`, video catalogue only.
- `ai-models-sync.ts` — `videoRow` now writes `supported_resolutions` from the synced
  `/videos/models` row instead of discarding it.
- `offerable-models.ts` — `videoResolutionsFor(row)` reads the synced row first, falls
  back to `VIDEO_RESOLUTIONS` (`['480p', '720p']`) only when the row hasn't got the
  field yet (pre-migration rows, sync lag). Both `videoChoice` (specced families) and
  `genericVideoChoice` (unspecced, "the app leads" fallback) use it — `videoChoice` no
  longer hardcodes the shared pair.
- `gen-node.ts` — `snapVideoResolution(choice, saved)`: pure function, wired into
  `+page.svelte`'s `commonChange` next to the existing `nearestVideoDuration` snap. A
  model switch on an existing node no longer keeps a `resolution` the new model
  doesn't serve; it snaps to the new model's first offered resolution.
- `video.ts` — `clampVideoResolution`, the last-mile guard right before the transport
  call, widened from the two-token allow-list to the real `POST /videos` enum
  (`360p|480p|720p|768p|1080p|1K|2K|4K`), normalizing case (`1080P` → `1080p`, `1k` →
  `1K`). This is the transport-wide ceiling, not per-model — per-model narrowing (what
  the UI *offers*) stays in `offerable-models.ts`/`snapVideoResolution`.
- `gen-cost.ts` — `RESOLUTION_MULTIPLIERS` still only has measured numbers (480p→1×,
  720p→2×). A resolution outside that table (1080p, 4K, …) now makes `creditsForRun`
  return `null` instead of silently defaulting to 1× — no synced per-resolution
  pricing exists yet to compute a real number from, and a wrong number is worse than
  no number.

## Backfill note

The migration adds the column; `supported_resolutions` for already-synced rows is
empty until the next `syncAiModels` cron tick re-reads `/videos/models`. Backfilled the
current production rows by hand (from the same live `/videos/models` read used to
verify this fix) so the fix is effective immediately rather than waiting for the next
scheduled sync.

## Verified

Unit tests (`ai-models-sync.test.ts`, `offerable-models.test.ts`, `gen-node.test.ts`,
`gen-cost.test.ts`, `video.test.ts`) cover: the sync passthrough, per-model resolution
offering (happyhorse never offers 480p), the generic-row fallback, resolution
snap-on-model-switch, the unpriced-resolution-returns-null case, and
`clampVideoResolution`'s widened/case-normalized enum.

Live: created a video node on `alibaba/happyhorse-1.0` through the actual canvas
actions (`?/create`, `?/write`, `?/run`, drained by `/api/v1/canvas/runs/tick`) at
720p/3s, the model's cheapest offered resolution and shortest duration. See the commit
for the render outcome and `ai_calls` cost.
