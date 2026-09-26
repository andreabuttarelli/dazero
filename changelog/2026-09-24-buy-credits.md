# Buying credits actually works: real Stripe Checkout, org-scoped

The ledger side (`credit_ledger`, the two `orgs.stripe_*` columns, `org_credit_balance`,
`org_credits_at_risk`, and the triggers that turn `stripe.checkout_sessions`/
`stripe.subscriptions` rows into grants — `20260922_org_billing.sql`) has been live for a while.
What was missing: nothing actually created a Stripe Checkout Session for a purchase. The
subscription "upgrade" action routed through the hosted billing *portal*, which can only change
an existing subscription — an org that never subscribed had no way to start one. There was no
one-time purchase path at all.

## What's new

- `src/lib/server/stripe.ts`: `ensureOrgCustomer` (org-level, mirrors the existing but unused
  `ensureBrandCustomer`), `createOneTimeCreditCheckout` (`mode: 'payment'`, amount inlined via
  `price_data` — no Stripe Price object needed), `createSubscriptionCheckout` (`mode:
  'subscription'`, needs a real Price id per rung), and `subscriptionPriceIdFor(rungPrice)`
  reading `STRIPE_PRICE_ID_SUBSCRIPTION_<rung>` env vars — the one place these ids are read.
- `POST /api/v1/brands/:slug/billing/checkout`: when a rung is picked and the org has no
  subscription yet, it now mints a real Checkout Session instead of refusing `no_subscription`.
  If no price id is configured for that rung, it answers `subscriptions_not_configured` (409)
  rather than minting a broken session. An org that already has a subscription still goes
  through the portal's "upgrade" flow, unchanged.
- New `POST /api/v1/brands/:slug/billing/checkout/one-time` +
  `ONE_TIME_CHECKOUT_LINK`/`create_one_time_checkout_link` in `packages/api-contracts`: buys a
  ladder rung's `creditsOneTime` once, at the 70:1 rate, no subscription involved and no price id
  needed. Works even for an org with no Stripe customer yet — one gets created on the spot.
- `/app/billing`: the ladder now shows both columns (subscription vs one-time, credits per rung)
  with a buy button each, instead of only the subscription rungs. New `buyOneTime` form action,
  org-scoped (no brand needed — a one-time purchase is never routed through a brand's settings).
- `orgBillingForBrand`/`orgBillingById` (`org-billing.ts`) now also return `orgName` — needed to
  create the Stripe customer with a real name instead of an id.
- `UpgradeLink.svelte` (the "Buy credits" link shown when a generation is refused for zero
  credits) pointed at `/app/:brand/settings/billing`, a route removed in the org-billing
  refactor. Fixed to `/app/billing`.

## The readiness gate (added after the first pass above)

The `stripe` schema doesn't exist on the live DB at all — checked directly
(`information_schema.schemata`/`tables`, not just via PostgREST, which never exposes non-`public`
schemas regardless). `20260922_org_billing.sql`'s sections 2/3/7/8 (a schema this repo invented
itself, meant to stand in for a real sync integration, plus both grant triggers) never landed,
even though sections 1/4/5/6 (the `orgs` columns, `credit_ledger`, `org_credit_balance`,
`org_credits_at_risk`) did. Decision: the user installs the real Supabase Stripe Sync Engine
(github.com/stripe/sync-engine) instead of this repo owning a fake `stripe` schema. Until it's
installed and its triggers applied, a completed Checkout Session would never become a
`credit_ledger` grant — the button would work, the money would move, the credits wouldn't land.

So purchases now refuse outright instead of silently losing a payment:

- `public.billing_grants_ready()` (new migration `20260924_billing_grants_ready.sql`, not
  applied) is true only when `stripe.checkout_sessions` exists AND a grant trigger is attached to
  it. `src/lib/server/billing-readiness.ts` calls it through the server layer and fails CLOSED on
  any RPC error, including "function does not exist" — so the live code never assumes the
  migration is applied.
- The billing page load, both checkout endpoints (`/checkout`, `/checkout/one-time`) and both
  server actions (`upgrade`, `buyOneTime`) all read it before doing anything else. Not ready →
  the page hides the buy buttons and shows "Purchases open soon.", the endpoints answer 409
  `purchases_not_ready` (new failure in the `CHECKOUT_LINK`/`ONE_TIME_CHECKOUT_LINK` contracts).
- New migration `20260924_stripe_sync_grants.sql` (not applied) replaces the fake-schema-shaped
  trigger sections of `20260922_org_billing.sql`: same trigger logic, verified column-for-column
  against the real Sync Engine's migrations (`stripe.checkout_sessions`: `customer`, `mode`,
  `status`, `payment_status`, `metadata`; `stripe.subscriptions`: `customer` — not
  `customer_id` — `items` jsonb with `items->'data'->0->'price'->>'id'`, `metadata`,
  `current_period_start`/`end`). It refuses to apply (raises) if the Sync Engine's tables don't
  exist yet, so it can be applied any time without ordering risk.
- `20260924_credits_from_price_id.sql` is **superseded** by the new migration (same placeholder
  function, redefined there) — kept in the repo as history, not deleted, per the immutable-
  migrations rule.
- `org_credits_at_risk`: the live view (`expiring_credits`/`next_expiry`, no FIFO, no spend
  subtraction) doesn't match the FIFO-net view `20260922_org_billing.sql` describes. Left as-is
  and documented in that migration file — it only feeds a warning line, never the spend gate, and
  it's a ceiling on risk (never understates it), so the extra complexity isn't worth it right now.
- No Stripe Price ids exist yet for the seven subscription rungs (`.env.example`,
  `STRIPE_PRICE_ID_SUBSCRIPTION_5` … `_400`) — orthogonal to readiness; even once grants can land,
  a rung with no Price id still answers `subscriptions_not_configured`.
- Full walkthrough for the user: `docs/billing-setup.md`.
