import type { Db } from '$lib/server/db/client';

/**
 * LE COLONNE VERE DI `brands` sul database nuovo (klnswzhhgrqvbfjzioul): `id, org_id, name, slug,
 * website, short_description, content, palette, target, logo_url` — non `status`/`plan`/
 * `target_platforms`/`content_prefs`/`ads_settings`/`zernio_profile_id`, che sono del vecchio
 * schema e che `src/lib/server/projects/brand-shell.ts` continua a chiedere (42703, silenziosa: il
 * client Supabase non lancia, e quel codice legge solo `{data}` — `brand` diventa `null` per ogni
 * progetto che un brand ce l'ha davvero). Quel file è di un altro giro: qui si legge solo quello
 * che la tabella ha per davvero.
 */
export type Brand = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  shortDescription: string | null;
  logoUrl: string | null;
};

const BRAND_COLUMNS = 'id, name, slug, website, short_description, logo_url';

type BrandColumns = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  short_description: string | null;
  logo_url: string | null;
};

function toBrand(row: BrandColumns): Brand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    website: row.website,
    shortDescription: row.short_description,
    logoUrl: row.logo_url
  };
}

export async function listOrgBrands(db: Db, orgId: string): Promise<Brand[]> {
  const { data, error } = await db.from('brands').select(BRAND_COLUMNS).eq('org_id', orgId).order('name');
  if (error) throw error;
  return ((data ?? []) as unknown as BrandColumns[]).map(toBrand);
}

export async function findBrand(db: Db, input: { orgId: string; brandId: string }): Promise<Brand | null> {
  const { data, error } = await db
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.brandId)
    .maybeSingle();
  if (error) throw error;
  return data ? toBrand(data as unknown as BrandColumns) : null;
}
