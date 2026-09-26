# Connecting a social account is possible again

Found by the billing agent while wiring the per-account seat fee: the whole Zernio connect
pipeline still targeted the old schema. Nothing was ever going to publish.

## What was broken

- `zernio.ts` `ensureBrandProfile` wrote `brands.zernio_profile_id` — not a column on the new
  `brands` (`id, org_id, name, slug, website, short_description, content, logo_url, created_at,
  updated_at`, confirmed by `database.types.ts` and `schema-drift-check.mjs`).
- The connect gate everywhere (`settings/connect/[platform]/+server.ts`,
  `settings/facebook/+page.server.ts`, `settings/linkedin/+page.server.ts`,
  `settings-actions.ts`'s `sync`, the `/social/connect` API route, `settings/+layout.server.ts`)
  read `brands.plan`/`.status` and called `canConnectSocials`/`accountLimit` from `plans.ts` —
  same missing columns. `loadBrandForUser` (`cli-auth.ts`) already papers over this for the CLI
  path by hardcoding `plan: null, status: 'active'` on every brand, which makes
  `canConnectSocials` always false: the gate was permanently shut, silently, no error anyone
  would see.
- `zernio.ts` `syncBrandAccounts` upserted `social_accounts.username`/`.profile_url` — the real
  columns are `handle` (no `profile_url` equivalent on this schema).

None of this was a partial rollout: it's 2026-era code written against the pre-refactor schema
(`supabase/migrations/0001_foundations.sql`, `0005_social_accounts.sql`) that was never touched
when the canvas rewrite reshaped `brands`/`social_accounts`.

## Design: where the profile pointer lives

`social_accounts.zernio_profile_id` already exists live (it's on every account row from
`0005_social_accounts.sql`, re-created with the new schema). But `ensureBrandProfile` mints the
profile BEFORE the first account exists — there's no `social_accounts` row yet to point from. A
Zernio profile is 1:1 with a brand (every account a brand connects publishes through the same
one), so the natural single home is `brands.zernio_profile_id` — one row, never a second copy
that can drift from it.

New migration: `supabase/canvas-migrations/20260924_brands_zernio_profile.sql`. Adds the column
plus a trigger that blocks `authenticated` from writing it directly (only service-role can — same
posture `zernio.ts`'s existing comment already claimed, just pointing at a migration that didn't
exist). **Not applied yet** — per instructions, live code now depends on it (see below), so it
needs applying before this ships. Ran `schema-drift-check.mjs` before and after; the new column
doesn't change any pre-existing drift line, and the checker doesn't read
`canvas-migrations/` at all (only the legacy `supabase/migrations/`), so it can't validate this
one either way.

## Design: the gate, replaced end to end

No plan tiers exist anymore — billing is credits. Replaced `canConnectSocials(brand.plan,
brand.status)` everywhere with a real check against the org's credit balance:
`social-connections.ts` gained `canAffordSeat(supabase, orgId)` (balance >=
`ACCOUNT_SEAT_CREDITS`, the monthly per-account fee `account-billing.ts` already computes) and
`affordableSeats(balance)` (how many more seats that balance covers), both backed by
`orgCreditBalance` / the `org_credit_balance` RPC — the same ledger every other credit gate in
this repo reads, not a second implementation.

`socialConnections`'s `slots.limit` used to be a plan cap (`ACCOUNT_LIMITS`); it's now "how many
accounts the org can sustain right now, already-paid ones included" — derived, not configured,
so buying more credits raises it immediately with no code path to update.

`settings/+layout.server.ts` now also passes `seatCostUsd` (`ACCOUNT_SEAT_USD`) down to the
connected-accounts page, which shows "Each connected account costs $11/month" above the platform
list — the cost is visible before a click starts the OAuth round-trip, not after.

The API contract (`packages/api-contracts/src/social.ts`) had two failure modes,
`plan_cannot_connect` and `account_limit` — both meant "no more plan-tier room," which credits
collapse into one condition. Replaced both with a single `insufficient_credits`. Also fixed a
latent bug while doing this: the old connect route rejected re-authorizing an ALREADY-connected
platform whenever `!canConnect`, contradicting its own comment ("reauthorizing an already
connected platform should never be blocked") — the new single gate only fires for a platform not
yet connected.

Synced the CLI's vendored contract copy (`cli/scripts/sync-contracts.sh`) for `social.ts` only —
`billing.ts`/`index.ts` are another agent's uncommitted work in progress on the same branch;
left those alone.

## Seat fee, wired

`account-billing.ts`'s `chargeAccountSeat`/`renewAccountSeats` existed, tested, and were never
called from anywhere. `syncBrandAccounts` now charges it for every account it syncs `active`
(idempotent per account+month via `credit_ledger_social_seat_month_idx` — a re-sync of an
already-billed account is a no-op debit attempt that the unique index turns into
`already_charged`, not a second charge). Needed `syncBrandAccounts`'s upsert to `.select('id')`
back since `chargeAccountSeat` charges by `social_accounts.id`, not the Zernio account id.

## The connect path, traced

Settings page "Connect Instagram" → `settings/connect/instagram` (`+server.ts`) → session check
→ `canAffordSeat` (redirects to `/app/billing` if short) → `ensureBrandProfile` (mints/reuses
`brands.zernio_profile_id`) → `getConnectUrl` → Zernio OAuth → callback lands back on
`settings/connected-accounts?connected=1` (or the headless Facebook/LinkedIn selector pages,
same gate) → the page's `onMount` sees `?connected` and submits the sync form → `sync` action
(`settings-actions.ts`) → `canAffordSeat` again → `syncBrandAccounts` → upserts `social_accounts`
(`handle`, not `username`) → charges the seat fee per newly-active account.

## Also fixed while tracing it

`settings/+layout.server.ts` (drives the whole settings section, not just connected-accounts)
read `brand.plan`/`accountLimit(brand.plan)` from `ProjectBrandShell`
(`projects/brand-shell.ts`), which hardcodes `plan: null` for the same missing-column reason —
so `data.limit` was always `0` and the "Connect" button never rendered in the actual UI,
independent of the CLI-side defect above. Replaced with `orgCreditBalance` +
`affordableSeats`. The Svelte page (`connected-accounts/+page.svelte`) dropped its own
`canConnectSocials` import (same dead plan check) — `atLimit` now derives from
`data.used >= data.limit` alone, and both old branches ("plan can't connect" / "at limit")
collapsed into one, since under credits they're the same condition.

## Out of scope, left alone

`ads.ts`/`ads-actions.ts`/`settings/ads/accounts/+page.server.ts` reference the same phantom
`brands.plan`/`.zernio_profile_id` columns for AD account connections (Meta ads via Zernio) —
a different pipeline, sharing only the root cause. Not touched: fixing it needs the same
migration but a separate design pass, and touching it risked the Stripe/billing agent's
concurrent work in this tree (`stripe.ts`, `org-billing.ts`, `billing-links.ts`). Flagged for a
follow-up task.

`createAdminClient()` in `zernio.ts` bypasses `db/service-role-uses.ts`'s registry entirely (a
separate, older admin-client path this repo also has) — pre-existing, not introduced here, and
out of scope to migrate onto `createServiceRoleDb` as part of this fix.

## Tests

New: `social-connections.test.ts`, `zernio-connect.test.ts` (TDD — written and watched fail
against the old `plan`/`status` gate before the fix). Updated: both `/social/connect` and
`/social/accounts` route tests (fixture needed `org_id` + an `.rpc()` mock),
`packages/api-contracts/src/social.test.ts` (failure code). All green; `tsc --noEmit` shows the
same 160 pre-existing errors before and after (none in touched files — verified by diff).
