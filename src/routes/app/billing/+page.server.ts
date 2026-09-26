import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { orgCreditBalance } from '$lib/server/credits';
import { ensureOrgForUser } from '$lib/server/org';
import { billedCreditsFor, CREDIT_LADDER } from '$lib/server/credit-ladder';
import { isOrgOwner } from '$lib/server/org-billing';
import { billingGrantsReady } from '$lib/server/billing-readiness';
import {
  billingPortal,
  upgrade,
  applyRetention,
  cancelPlan
} from '$lib/server/settings-actions';

const PURCHASES_NOT_READY = 'Purchases open soon.';

const stripeApi = () => import('$lib/server/stripe');

type OrgRow = { id: string; name: string; stripe_customer_id: string | null };
type BrandRow = { id: string; name: string; slug: string };

/**
 * One credit balance covers the whole organization (`orgs.stripe_customer_id`,
 * `credit_ledger`/`org_credit_balance` — no `organizations` table, no `brands.plan`). This page
 * answers for the org: its balance, the ladder, and which of its brands is spending it.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw redirect(303, '/login');

  const orgId = await ensureOrgForUser(supabase, user);
  if (!orgId) throw redirect(303, '/app');

  const [{ data: orgData }, { data: membership }, { data: brandRows }, { data: atRiskRows }, purchasesReady] =
    await Promise.all([
      supabase.from('orgs').select('id, name, stripe_customer_id').eq('id', orgId).maybeSingle(),
      supabase.from('orgs_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle(),
      supabase.from('brands').select('id, name, slug').eq('org_id', orgId),
      // org_credits_at_risk: un rigo per org, non FIFO per scadenza — la vista LIVE (verificata via
      // pg_get_viewdef, non solo il file) somma ogni grant con expires_at non nullo e prende la
      // scadenza più vicina, senza sottrarre quanto già speso. `20260922_org_billing.sql` descrive
      // una vista diversa (FIFO, netta della spesa, colonne `at_risk`/`expires_at`): quella
      // migrazione e la vista davvero applicata sono divergenti — questa query segue la vista viva,
      // non il file, e "a rischio" qui è un tetto per eccesso, non l'importo esatto ancora spendibile.
      supabase
        .from('org_credits_at_risk')
        .select('expiring_credits, next_expiry')
        .eq('org_id', orgId)
        .order('next_expiry'),
      billingGrantsReady(supabase)
    ]);
  const org = orgData as OrgRow | null;
  if (!org) throw redirect(303, '/app');

  const brands = (brandRows ?? []) as BrandRow[];
  const billingBrand = brands[0] ?? null;
  const atRisk = ((atRiskRows ?? []) as { next_expiry: string; expiring_credits: number }[]).map((row) => ({
    expiresAt: row.next_expiry,
    amount: row.expiring_credits
  }));

  const balance = await orgCreditBalance(supabase, orgId);

  const spends = await Promise.all(
    brands.map(async (b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      credits: billedCreditsFor(await sumBrandCostUsd(supabase, b.id))
    }))
  );

  return {
    org: { id: org.id, name: org.name },
    credits: { balance, ladder: CREDIT_LADDER, atRisk },
    brands: spends,
    hasBilling: !!org.stripe_customer_id,
    billingBrandSlug: billingBrand?.slug ?? null,
    isOwner: (membership as { role?: string } | null)?.role === 'owner',
    purchasesReady
  };
};

/** Provider cost for one brand over the current calendar month — the same reading credits.ts sums for the gate. */
async function sumBrandCostUsd(supabase: App.Locals['supabase'], brandId: string): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { data } = await supabase
    .from('ai_calls')
    .select('cost_usd')
    .eq('brand_id', brandId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());

  return (data ?? []).reduce((sum: number, row: { cost_usd: number | null }) => sum + (row.cost_usd ?? 0), 0);
}

/**
 * The billing actions are the brand ones, unchanged: they resolve the org themselves and take the
 * brand slug from `params`. Running them here — rather than posting to the brand route, whose GET
 * now redirects — is what keeps a `fail()` visible: a redirecting load would swallow the message.
 */
async function billingBrandSlug(supabase: App.Locals['supabase']): Promise<string | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const orgId = await ensureOrgForUser(supabase, user);
  if (!orgId) return null;

  const { data } = await supabase.from('brands').select('slug').eq('org_id', orgId).limit(1).maybeSingle();
  return (data as { slug?: string } | null)?.slug ?? null;
}

function onBillingBrand(fn: (event: RequestEvent) => unknown) {
  return async (event: RequestEvent) => {
    const brand = await billingBrandSlug(event.locals.supabase);
    if (!brand) return fail(400, { billingError: 'No brand to bill' });
    return fn({ ...event, params: { ...event.params, brand } } as RequestEvent);
  };
}

/**
 * The only rung of CREDIT_LADDER that needs no brand at all: a one-time purchase is never a
 * subscription, so there is nothing to route through a brand's settings the way `upgrade` does.
 * It runs directly against the org the signed-in user belongs to.
 */
async function buyOneTime({ request, url, locals: { supabase } }: RequestEvent) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw redirect(303, '/login');

  const orgId = await ensureOrgForUser(supabase, user);
  if (!orgId) return fail(404, { billingError: 'No organization' });

  if (!(await isOrgOwner(supabase, orgId, user.id))) {
    return fail(403, { billingError: 'Owner only' });
  }

  if (!(await billingGrantsReady(supabase))) {
    return fail(409, { billingError: PURCHASES_NOT_READY });
  }

  const data = await request.formData();
  const usd = Number(data.get('usd') ?? '');
  const rung = CREDIT_LADDER.find((r) => r.price === usd);
  if (!rung) return fail(400, { billingError: 'Unknown one-time pack' });

  const { data: orgRow } = await supabase
    .from('orgs')
    .select('id, name, stripe_customer_id')
    .eq('id', orgId)
    .maybeSingle();
  const org = orgRow as { id: string; name: string; stripe_customer_id: string | null } | null;
  if (!org) return fail(404, { billingError: 'Organization not found' });

  const returnUrl = `${url.origin}/app/billing`;

  let checkoutUrl: string;
  try {
    const { ensureOrgCustomer, createOneTimeCreditCheckout } = await stripeApi();
    const customerId = await ensureOrgCustomer(org);
    checkoutUrl = await createOneTimeCreditCheckout({
      customerId,
      orgId: org.id,
      price: rung.price,
      credits: rung.creditsOneTime,
      successUrl: returnUrl,
      cancelUrl: returnUrl
    });
  } catch (e) {
    return fail(500, { billingError: e instanceof Error ? e.message : 'Could not start the purchase' });
  }
  throw redirect(303, checkoutUrl);
}

export const actions: Actions = {
  billingPortal: onBillingBrand(billingPortal as (e: RequestEvent) => unknown),
  upgrade: onBillingBrand(upgrade as (e: RequestEvent) => unknown),
  applyRetention: onBillingBrand(applyRetention as (e: RequestEvent) => unknown),
  cancelPlan: onBillingBrand(cancelPlan as (e: RequestEvent) => unknown),
  buyOneTime
};
