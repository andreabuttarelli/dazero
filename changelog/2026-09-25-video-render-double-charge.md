# A canvas video render could be billed twice

Live: `gen-vid-1790343059-DMUNxBnYN5AGuHrvWGts` (`alibaba/happyhorse-1.0`, 3s 720p)
has two `ai_calls` rows, ~500ms apart, each `$0.494`, each with a matching
`credit_ledger` debit (99 credits × 2). Not isolated — grouping `ai_calls.operation`
by the job id embedded in it found the same pattern up to 5× on other jobs, same org
(`ad0fa412-a493-41f6-b254-323db174dac5`), all in the last two days.

## Root cause

Two cron routes independently finish video jobs, each with its own atomic claim on
its own table, neither aware of the other:

- `/api/v1/videos/render/work` → `reconcileVideoRenders`
  (`src/lib/server/video-render-queue.ts`) claims `video_renders.status`
  (`rendering → finishing`) before calling `finishVideoRender`.
- `/api/v1/canvas/runs/tick` → `reconcileVideoNodeRuns`
  (`src/lib/server/canvas/generate.ts`) claims `node_runs.status`
  (`running → finishing` via `claimRun`) — then read `video_renders` by id
  (`findVideoRenderRow`) and called `finishVideoRender` on it directly, **without
  ever claiming or checking `video_renders.status`**.

For a canvas video node, `node_runs.external_job_id` points at a `video_renders.id`.
Both crons run every minute. When both reconcile the same job in the same window,
each claim succeeds on its own table, and each calls `finishVideoRender`, which
unconditionally logs an `ai_calls` row and a `credit_ledger` debit
(`src/lib/server/ai-log.ts` `logAiCall`) — no idempotency key on the provider job id
anywhere.

## Fix

`reconcileVideoNodeRuns` now also claims `video_renders` (the same
`rendering → finishing` transition `reconcileVideoRenders` already uses) before
calling `finishVideoRender`. Zero rows updated means the other reconciler already
took it — the run's own claim is released and the row is retried next tick, same
contract as a `pending` outcome. On a `pending` result or a retryable `failed`
result, the `video_renders` claim is released back to `rendering` so either
reconciler can pick it up again. No DB migration needed — `video_renders.status`
already existed and already had this exact transition; it just wasn't being used by
this second reconciler.

## Test

`src/lib/server/canvas/generate.test.ts`: `un video_renders già preso dall'altro
riconciliatore non si finisce due volte` — a `video_renders` row already `finishing`
(simulating the other cron having claimed it first) must not reach
`finishVideoRender`; the run releases and retries instead. Failing before the fix
(`finishVideoRender` called once regardless), green after.

## Also fixed in this commit

`src/lib/server/video.openrouter.test.ts`: the `un modello che OpenRouter non ha non
ha un trasporto` case asserted a `"non è nel catalogo video"` rejection that no
longer exists — unspecced models now pass through to OpenRouter, which is the sole
judge of what it serves (2026-09-25, model-catalogue change). Replaced with a test
of the current behaviour: an unlisted model id still reaches the OpenRouter submit
call.

## Not done here

Refund: the org ids, job ids and amounts double/multi-charged are reported to the
repo owner; money is not moved by this change.

## Verified

`generate.test.ts`, `video-render-queue.test.ts`,
`video-render-queue.brand-free.test.ts`, `video.openrouter.test.ts` — 59 tests, all
green. `tsc --noEmit` clean on touched files.
