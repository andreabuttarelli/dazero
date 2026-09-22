import type { LayoutServerLoad } from './$types';
import { accountLimit, plansAbove, isTopPlan } from '$lib/server/plans';
import { isBrandOwner } from '$lib/server/settings-actions';
import { loadStudioDeferred } from '$lib/server/studio-deferred';
import { orgBillingForBrand } from '$lib/server/org-billing';
import { requireBrand } from '$lib/server/projects/brand-shell';

export const load: LayoutServerLoad = async ({ parent, locals: { supabase } }) => {
  const { brand: brandOrNull } = await parent();
  const brand = requireBrand(brandOrNull);
  const [{ data: accounts }, { data: apiKeysRaw }, isOwner, { data: invites }, billing] =
    await Promise.all([
      supabase
        .from('social_accounts')
        .select('id, platform, username, display_name, status')
        .eq('brand_id', brand.id)
        .order('connected_at', { ascending: true }),
      supabase
        .from('api_keys')
        .select('id, name, key_prefix, permissions, created_at, last_used_at')
        .order('created_at', { ascending: false }),
      isBrandOwner(supabase, brand.slug),
      supabase
        .from('brand_invites')
        .select('id, email, accepted_at, created_at')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: true }),
      orgBillingForBrand(supabase, { id: brand.id })
    ]);

  const list = accounts ?? [];
  const apiKeys = (apiKeysRaw ?? []).filter((k: { permissions?: { brand_ids?: unknown } }) => {
    const bids = k.permissions?.brand_ids;
    return bids === '*' || (Array.isArray(bids) && bids.includes(brand.id));
  });

  return {
    brand,
    accounts: list,
    limit: accountLimit(brand.plan),
    used: list.filter((a) => a.status === 'active').length,
    // The org pays, so a free brand sitting next to a paying sibling still has billing to show.
    hasBilling: !!billing?.customerId,
    upgrades: plansAbove(billing?.plan ?? brand.plan),
    atTopPlan: isTopPlan(billing?.plan ?? brand.plan),
    apiKeys,
    isOwner,
    invites: invites ?? [],
    // Brand kit sections under settings reuse StudioPage (needs deferred).
    deferred: loadStudioDeferred(supabase, brand.id)
  };
};
