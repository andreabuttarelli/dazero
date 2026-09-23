import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { orgCreditBalance } from '$lib/server/credits';
import { ensureOrgForUser } from '$lib/server/org';
import { CREDIT_LADDER } from '$lib/server/credit-ladder';
import {
  billingPortal,
  upgrade,
  applyRetention,
  cancelPlan
} from '$lib/server/settings-actions';

const CREDITS_PER_USD_AI_SPEND = 200;

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

  const [{ data: orgData }, { data: membership }, { data: brandRows }] = await Promise.all([
    supabase.from('orgs').select('id, name, stripe_customer_id').eq('id', orgId).maybeSingle(),
    supabase.from('orgs_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle(),
    supabase.from('brands').select('id, name, slug').eq('org_id', orgId)
  ]);
  const org = orgData as OrgRow | null;
  if (!org) throw redirect(303, '/app');

  const brands = (brandRows ?? []) as BrandRow[];
  const billingBrand = brands[0] ?? null;

  const balance = await orgCreditBalance(supabase, orgId);

  const spends = await Promise.all(
    brands.map(async (b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      credits: Math.round((await sumBrandCostUsd(supabase, b.id)) * CREDITS_PER_USD_AI_SPEND)
    }))
  );

  return {
    org: { id: org.id, name: org.name },
    credits: { balance, ladder: CREDIT_LADDER },
    brands: spends,
    hasBilling: !!org.stripe_customer_id,
    billingBrandSlug: billingBrand?.slug ?? null,
    isOwner: (membership as { role?: string } | null)?.role === 'owner'
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

export const actions: Actions = {
  billingPortal: onBillingBrand(billingPortal as (e: RequestEvent) => unknown),
  upgrade: onBillingBrand(upgrade as (e: RequestEvent) => unknown),
  applyRetention: onBillingBrand(applyRetention as (e: RequestEvent) => unknown),
  cancelPlan: onBillingBrand(cancelPlan as (e: RequestEvent) => unknown)
};
