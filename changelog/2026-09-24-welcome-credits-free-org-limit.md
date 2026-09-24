# Welcome credits, capped at 2 free workspaces per user

Two related decisions from the same conversation: a new org gets 100 credits that expire in 14
days so it can try the product without paying first, and a user can't accumulate an unlimited
number of never-pay workspaces to keep re-claiming that grant.

## Welcome credits

- `WELCOME_CREDITS = 100`, `WELCOME_CREDITS_EXPIRY_DAYS = 14` (`credit-ladder.ts`, next to the
  ladder — same file that owns every other credit-pricing constant).
- `grantWelcomeCredits(db, orgId)` (`tenancy/free-org-limit.ts`) inserts one `credit_ledger`
  grant, `source: 'promo'` (already an allowed value — no new source needed for this one),
  `stripe_event_id: 'welcome:' + orgId`. That column already carries a unique constraint
  (`20260922_org_billing.sql`, built for Stripe event idempotency); reusing it means a concurrent
  retry or a second call finds `23505` and does nothing, instead of a second grant.
- Called from `createFirstOrgWith` (`tenancy/bootstrap.ts`) right after the org and its first
  member exist — the one function every org-creation path funnels through
  (`enterApp`/`firstOrgOnce` → `createFirstOrg` → `createFirstOrgWith`).

## Free-org limit

- `FREE_ORGS_PER_USER = 2` (`credit-ladder.ts`). "Free" = an org with no `credit_ledger` row
  whose `source` is `subscription_renewal` or `one_time_purchase`, ever — the welcome grant
  itself (`promo`) doesn't count, or no org would stay free past its first grant.
- Counts **membership**, not ownership: an org someone was invited into counts the same as one
  they created (`orgs_members`, any role).
- `assertFreeOrgLimit(db, { userId, joiningOrgId })` (`tenancy/free-org-limit.ts`) is the one
  rule, called from both places an `orgs_members` row is about to be born:
  `createFirstOrgWith` (after the org row exists, before the membership insert — a refusal
  deletes the just-created org) and `acceptInviteWith` (before the membership insert, after the
  invite itself is confirmed valid). An org that has already paid is never blocked by this check,
  no matter how many free orgs the user already has — `assertFreeOrgLimit` checks whether the
  org being joined is free first, and returns immediately if it isn't.
- `FreeOrgLimitReachedError` is a distinct, catchable type — not folded into
  `AcceptOutcome`'s existing `{ outcome: 'invalid' }`, which already means "this token doesn't
  work" and would have hidden a different refusal behind the same non-answer.
- DB-level backstop, `20260924_seat_fees_welcome_credits.sql`: a `before insert` trigger on
  `orgs_members` re-runs the same free/paid distinction and rejects a third free membership for
  the same user, closing the path where someone inserts into `orgs_members` directly through the
  Data API with their own JWT instead of going through the app. Belt-and-suspenders — the app
  rule is what actually answers with a readable message; the trigger is what makes a bypass
  impossible rather than merely unsupported.

## Pending migration

`supabase/canvas-migrations/20260924_seat_fees_welcome_credits.sql` — not applied by me (repo
rule: migrations are written, the user applies them). It also widens `credit_ledger.source` to
add `'social_seat'` (unrelated to welcome credits, needed for the monthly per-account fee) and
adds `credit_ledger.social_account_id` + its idempotency index. Until applied, `assertFreeOrgLimit`
still runs in the app (uses only `credit_ledger`/`orgs_members`, both already live) — only the
trigger backstop is missing.

## What's unverified

I could not confirm live, as an authenticated user, that direct `orgs_members` inserts through
the Data API were actually blocked by RLS before this trigger — `createFirstOrgWith`'s own doc
comment states the policy rejects an insert before the user's first membership exists (the
chicken-and-egg case service-role exists for), but I don't have a way to test an authenticated
JWT's INSERT policy on `orgs_members` for a user who already has one membership, from this
sandbox. The trigger closes the gap regardless of what that policy turns out to allow.

## Not yet wired

`acceptInvite`/`acceptInviteWith` has no HTTP route calling it yet — there's no invite-accept UI
in this codebase today, so `FreeOrgLimitReachedError` from that path has nowhere to surface a
message to a human. The function-level behavior and its test coverage are in place for when that
route is built.
