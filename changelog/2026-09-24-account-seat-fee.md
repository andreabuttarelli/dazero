# Monthly credit fee per connected social account

Started, not finished: the billing mechanism is real and tested; the connect-time charge and the
plan-tier account cap removal are blocked by a pre-existing, unrelated defect found while wiring
this in (see "Blocked" below).

## What's done

- `ACCOUNT_SEAT_USD = 11`, `ACCOUNT_SEAT_CREDITS = 2200` (`credit-ladder.ts`). Zernio's per-account
  cost is a single unmeasured `~$7/account` comment in `plans.ts` — `$7 / (1 - 0.35 margin floor)
  = $10.77`, rounded to $11 for a number a customer reads without a calculator (36.4% actual
  margin). **Placeholder — confirm the real Zernio cost before this goes live**;
  `ZERNIO_COST_PER_ACCOUNT_USD_PLACEHOLDER` names it as one.
- `chargeAccountSeat(db, { accountId, orgId })` (`account-billing.ts`): debits
  `ACCOUNT_SEAT_CREDITS` from `credit_ledger` (source `social_seat`, new — see the pending
  migration) if the org's balance covers it; if not, sets the account's `status` to `paused` with
  a readable `last_error` instead of keeping it live for free. Idempotent per account+calendar
  month, enforced by a partial unique index (`social_account_id`, `date_trunc('month',
  created_at)`) — a second call for the same account this month is a no-op, not a double charge.
- `renewAccountSeats(db)`: every `active` account, one `chargeAccountSeat` call each. Wired into
  the existing `canvas/runs/tick` cron (no new cron — the brief's stated preference) rather than a
  dedicated one; gated to the top of the hour (`getUTCMinutes() === 0`) so scanning every active
  account isn't repeated all 60 times an hour once idempotency has already made every call after
  the first a no-op for that month.
- First month: charged in full at connect time, not pro-rated — simpler, and consistent with "no
  card-math surprises" the ladder itself already commits to.

## Blocked

The connect route (`settings/connect/[platform]/+server.ts`) and the account-creation path
(`zernio.ts`'s `ensureBrandProfile`/`syncBrandAccounts`) are where the charge and the plan-tier
cap removal belong, and I did not touch either: **the whole Zernio connect pipeline is
non-functional today, for reasons unrelated to this task.**

- `ensureBrandProfile` writes `brands.zernio_profile_id` — that column does not exist on `brands`
  (verified against `database.types.ts`: the table has only `id, org_id, name, slug, website,
  short_description, content, palette, target, logo_url, created_at, updated_at`). The write
  fails 42703, silently.
- The connect route's own gate, `canConnectSocials(brand.plan, brand.status)`, reads two more
  columns `brands` doesn't have — `plan` and `status` — so it always evaluates
  `undefined === 'active'` and refuses. Every connect attempt redirects to `/app/billing` before
  reaching Zernio at all, independent of the column-42703 issue above.
- `syncBrandAccounts` upserts `social_accounts.username`/`.profile_url` — real columns are
  `handle` (no `profile_url` equivalent found).

None of this is caused by the credits work; it predates this session and I found it while tracing
where a charge would attach. Fixing it is a separate, larger task: it likely means moving the
brand↔Zernio-profile link onto a schema shape that actually exists (perhaps
`social_accounts.zernio_profile_id`, which DOES exist, or a new mapping) — a real design
decision, not a rename.

## Not done

- Removing `accountLimit`/`plansAbove`/`isTopPlan`/`brand.plan` from the connect gate and
  `settings/+layout.server.ts`'s `limit`/`used` fields: left in place since the whole gate is
  already dead code today (see above) and touching it without also fixing Zernio would produce
  code that compiles but still doesn't connect anything.
- The connect UI stating the monthly cost before connecting — no UI to update while the route
  behind it doesn't work.

## Tests

`src/lib/server/account-billing.test.ts`: charge success, insufficient-balance pause, idempotent
duplicate, `renewAccountSeats` charging/pausing/skipping across accounts, and that it queries only
`status = 'active'`.

## Pending migration

`20260924_seat_fees_welcome_credits.sql` (already pending from the welcome-credits change) is
also what this needs: `credit_ledger.source` widened for `'social_seat'`, plus
`credit_ledger.social_account_id` and its idempotency index. Nothing in this entry works until
that migration is applied.
