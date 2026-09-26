# Credits display as dollars: 1 credit = $1

The user wanted the UI to read 1 credit ≈ $1 instead of the sold rate (100 credits = $1). Only
display changes: `credit_ledger`, `org_credit_balance`, `ai_calls.billed_credits`,
`credit-ladder.ts`, the credit gates and the API/CLI numbers stay integer units — a generation
still costs 14 credits in the database, the UI now shows "0.14".

## What changed

- `formatCredits(units, { approx? })` (new, `src/lib/components/credit-amount-format.ts`) — the
  one place that divides by `DISPLAY_UNITS_PER_CREDIT = 100`, two decimals, `<0.01` floor for
  anything nonzero below a cent, `~` prefix for approximate costs. `toLocaleString` grouping, same
  convention the old formatter used.
- `CreditAmount.svelte` now renders through `formatCredits` — every place that already used the
  component picks up the new display for free: top bar balance, gen node Genera/Rifai/Loop
  buttons, billing page (balance, at-risk credits, ladder rungs, per-brand usage), referrals.
- Routed the same formatter through every other place that prints a raw credit number to a human:
  the loop/workflow `confirm()` prompts in the canvas page, `app.ads.launchCost` and the ads
  readiness `credits` check detail, `adsErrorMessage`'s `needed`/`left` values, the credit-warning
  email (`used`/`quota`), and `/docs/credits`' plan/chat-window tables (`PLANS[].credits` is
  marketing display data, not the ledger, but it's a credit amount shown to the user).

## What stayed in raw units, and why

- `credit-ladder.ts`, `credit_ledger`, `org_credit_balance`, `ai_calls.billed_credits`, the AI
  gates (`gateAiAction`) — the task is display-only; billing math and enforcement must not drift
  from what's actually charged.
- The CLI (`cli/commands/*`, MCP tool descriptions) — grepped for every place it mentions
  "credit": all are error codes, schema descriptions or static copy, never a printed number. No
  command in `cli/commands/dashboard.ts` or `cli/commands/upgrade.ts` prints a credit amount to a
  human, so there was nothing to normalize there.
- `data.stats.credited` on the referrals page — a count of successful referrals, not a credit
  amount; left alone.
