# One credit↔USD conversion, not five

Live in production: the loop preview estimated 7 credits/run for nano-banana-2, the real charge
was ~14. Root cause — `ai-log.ts` bills every AI call with `billedCreditsFor` (credit-ladder.ts),
200 credits per $1 of provider cost (100% markup). Five other files reimplemented the same idea
with their own `CREDITS_PER_USD = 100` constant — the *grant/purchase* rate, not the billing
rate — and fed it into estimates and usage totals that are supposed to match what gets billed.

## What was wrong, file by file

- `src/lib/server/content-cost.ts:30` — `IMAGE_CREDITS`/`videoCredits`/`TEXT_NODE_CREDITS` (feed
  `loop-cost.ts`'s pre-run estimate) converted at 100/$1. Now `billedCreditsFor`.
- `src/lib/server/credits.ts` — `getCreditsUsage`'s `used` summed real `cost_usd` from
  `ai_calls` at 100/$1, half of what those same rows are billed at in `ai_calls.billed_credits`.
  Now `billedCreditsFor(spentUsd)`.
- `src/lib/server/sandbox-credits.ts` — computed `credits` at 100/$1, then divided that back by
  100 for `flatCostUsd`, which `ai-log.ts` then re-billed at 200/$1: two conversions disagreeing
  with each other on the same row. Now passes the real USD cost through and derives `credits` for
  its own return value with `billedCreditsFor`.
- `src/lib/ads-fee.ts` (`creditsForSpend`) / `src/lib/server/ads-credits.ts`
  (`chargeAdsCredits`) — same double-conversion as sandbox: the management fee (real cost to us)
  was priced at 100/$1 for display but logged as `flatCostUsd = credits / 100`, then re-billed at
  200/$1 by `ai-log.ts`. `chargeAdsCredits` now takes `feeUsd` (USD) instead of `credits` and
  lets `ai-log.ts` price it once, the same way every other paid API is priced.
- `src/routes/app/billing/+page.server.ts` — already had the right number (200) but as its own
  local `CREDITS_PER_USD_AI_SPEND` constant. Now calls `billedCreditsFor` directly.

## What was correct and left alone

`src/lib/plans.ts` (`PLANS[].credits`) and `src/lib/server/plan-budget.ts`
(`productionCredits`/`weeklyCredits`) price a **different** thing: how many credits a
subscription *grants* per dollar of list price (100/$1 — the margin that funds blog, SEO, chat,
not just post production). That's a real, separate rate from what an AI call *bills* when spent
(200/$1) — a $89/mo plan granting 8,900 credits that cost ~$44.50 in real provider spend is by
design, not a bug. Gave this rate its own name, `CREDITS_PER_USD_GRANT`, in credit-ladder.ts
instead of leaving it as a bare `100` re-declared in two files.

Ads (`ads-actions.ts`) is preview-only in the UI (`ADS_SELF_SERVE = false`, `AdsBookCallPlaceholder`
gates the self-serve flow for everyone but the internal preview allowlist) but its billing path is
live for preview users and reachable from a cron sync — fixed, not left as dead code.

## Guardrail

`credit-ladder.test.ts` gains a source-scraping test (same pattern as
`packages/no-app-imports.test.ts`): no file under `src/` may declare its own `CREDITS_PER_USD =`
outside `credit-ladder.ts` itself, `plan-budget.ts`/`plans.test.ts` (the grant rate, explicitly
allowed and named). Also pins the loop estimate against `billedCreditsFor` directly for both
image and video media.
