import type { LayoutServerLoad } from './$types';
import { accountLimit, plansAbove, isTopPlan } from '$lib/server/plans';
import { isBrandOwner } from '$lib/server/settings-actions';
import { orgBillingForBrand } from '$lib/server/org-billing';
import { requireBrand } from '$lib/server/projects/brand-shell';

// La pagina Brand è l'unica sezione che sa cosa fare senza un brand: propone di sceglierne uno
// per il progetto (`projects.brand_id` è nullable, ed è il caso normale). Ogni altra sezione —
// ads, billing, i social connessi — non ha senso senza un brand reale, quindi continua a rifiutare.
const BRAND_ROUTE = 'settings/brand';

export const load: LayoutServerLoad = async ({ parent, url, locals: { supabase } }) => {
  const { brand: brandOrNull } = await parent();

  if (!brandOrNull && url.pathname.replace(/\/$/, '').endsWith(`/${BRAND_ROUTE}`)) {
    return {
      brand: null,
      accounts: [],
      limit: 0,
      used: 0,
      hasBilling: false,
      upgrades: [],
      atTopPlan: false,
      apiKeys: [],
      isOwner: false,
      invites: []
    };
  }

  const brand = requireBrand(brandOrNull);
  const [{ data: accounts }, { data: apiKeys }, isOwner, { data: invites }, billing] =
    await Promise.all([
      supabase
        .from('social_accounts')
        .select('id, platform, handle, display_name, status')
        .eq('brand_id', brand.id)
        .order('connected_at', { ascending: true }),
      // api_keys.org_id, non brand_id: una chiave vale per ogni brand dell'org (vedi ApiKeyInfo
      // in cli-auth.ts), quindi qui basta l'org del brand — niente più filtro per-brand su un
      // campo `permissions.brand_ids` che la colonna non porta.
      supabase
        .from('api_keys')
        .select('id, name, key_prefix, scopes, created_at, last_used_at')
        .eq('org_id', brand.org_id)
        .order('created_at', { ascending: false }),
      isBrandOwner(supabase, brand.slug),
      // orgs_invites è a livello di org, non di brand: non ha brand_id.
      supabase
        .from('orgs_invites')
        .select('id, email, accepted_at, created_at')
        .eq('org_id', brand.org_id)
        .order('created_at', { ascending: true }),
      orgBillingForBrand(supabase, { id: brand.id })
    ]);

  const list = accounts ?? [];

  return {
    brand,
    accounts: list,
    limit: accountLimit(brand.plan),
    used: list.filter((a) => a.status === 'active').length,
    // The org pays, so a free brand sitting next to a paying sibling still has billing to show.
    hasBilling: !!billing?.customerId,
    upgrades: plansAbove(billing?.plan ?? brand.plan),
    atTopPlan: isTopPlan(billing?.plan ?? brand.plan),
    apiKeys: apiKeys ?? [],
    isOwner,
    invites: invites ?? []
  };
};
