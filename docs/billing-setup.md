# Billing setup: Supabase Stripe Sync Engine

Purchases (subscriptions and one-time credit packs) are refused until this is done —
`public.billing_grants_ready()` gates every checkout path and answers false until both steps
below are complete. See `src/lib/server/billing-readiness.ts`.

## 1. Install the Stripe Sync Engine on project `klnswzhhgrqvbfjzioul`

Test mode first. The package is `stripe-sync-engine` (github.com/stripe/sync-engine — the
integration Supabase recommends; the npm package still installs under that name).

1. Get a **test-mode** Stripe secret key (`sk_test_...`) from the Stripe dashboard.
2. Run its migrations against the project's Postgres connection string (`DATABASE_URL`, direct
   connection — not the pooler). This creates the `stripe` schema: `stripe.customers`,
   `stripe.checkout_sessions`, `stripe.subscriptions`, etc. Nothing in this repo creates those
   tables; they are the Sync Engine's, not ours.
3. Deploy the Sync Engine's webhook handler (its own server, or the Supabase Edge Function
   variant if using that route) and point a **test-mode** Stripe webhook at it.
4. In the Stripe dashboard, add a webhook endpoint (test mode) subscribed to at least:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.created`
   - `customer.updated`

   (The Sync Engine also backfills from the Stripe API directly, so a first sync doesn't strictly
   need the webhook live yet — but the webhook is what keeps `stripe.subscriptions` and
   `stripe.checkout_sessions` current going forward.)

Once `stripe.checkout_sessions` and `stripe.subscriptions` exist and are being written to, come
back and ask Claude to apply:

- `supabase/canvas-migrations/20260924_billing_grants_ready.sql` — the readiness function.
- `supabase/canvas-migrations/20260924_stripe_sync_grants.sql` — the triggers that turn a
  completed checkout / an active subscription into a `credit_ledger` grant. It refuses to apply
  (raises an exception) if `stripe.checkout_sessions` or `stripe.subscriptions` don't exist yet,
  so it's safe to ask for any time — it just won't do anything until step 1 is real.

Both migrations are already written and sitting in `supabase/canvas-migrations/`, unapplied.
Neither creates a Stripe object or touches live data by itself.

## 2. Create the 7 subscription Prices

The credit ladder (`src/lib/server/credit-ladder.ts`) has 7 rungs: $5 / $15 / $30 / $50 / $100 /
$200 / $400 per month. Each rung needs a **recurring** Stripe Price (test mode first) — the
one-time purchase path needs no Price object (it inlines the amount), only subscriptions do.

For each rung, in the Stripe dashboard:

1. Create a Product (or reuse one product with 7 Prices — either works, the code only reads the
   Price id).
2. Add a recurring Price, monthly, in USD, at the rung's amount.
3. Copy the Price id (`price_...`) into the matching env var:

   ```
   STRIPE_PRICE_ID_SUBSCRIPTION_5=price_...
   STRIPE_PRICE_ID_SUBSCRIPTION_15=price_...
   STRIPE_PRICE_ID_SUBSCRIPTION_30=price_...
   STRIPE_PRICE_ID_SUBSCRIPTION_50=price_...
   STRIPE_PRICE_ID_SUBSCRIPTION_100=price_...
   STRIPE_PRICE_ID_SUBSCRIPTION_200=price_...
   STRIPE_PRICE_ID_SUBSCRIPTION_400=price_...
   ```

A rung with no Price id configured isn't broken — the checkout endpoint answers
`subscriptions_not_configured` instead of minting a session that would fail, and the one-time
purchase path for that same rung works regardless.

4. Ask Claude to update `credits_from_price_id()` in
   `supabase/canvas-migrations/20260924_stripe_sync_grants.sql` with the real price id → credits
   mapping (currently a placeholder, `else null` for every price) and re-apply it. This is the SQL
   side of the same table `subscriptionPriceIdFor` reads in `src/lib/server/stripe.ts` — the two
   have to move together or a subscription renews without ever granting credits.

## Going live

Repeat both sections with **live** Stripe keys/Prices and a **live**-mode Sync Engine
installation once test mode is verified end to end (a real test-card checkout completes and the
org's `credit_ledger` gets a row).
