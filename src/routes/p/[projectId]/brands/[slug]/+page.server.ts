import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { findOrCreateImportedAsset } from '$lib/server/repos/assets';
import { findOrCreateColourAsset } from '$lib/server/brand-colour-asset';
import { tokenizeChips } from '$lib/canvas/brand-content-chips';

/**
 * UN BRAND, DA TRASCINARE SULLA TELA — logo, nome, descrizione, content coi chip già pronti.
 *
 * OGNI COLORE DEL CONTENT HA GIÀ IL SUO ASSET quando la pagina arriva al browser, per lo stesso
 * motivo del logo (`brands/+page.server.ts`): `dragstart` è sincrono. `tokenizeChips` legge lo
 * stesso `content` che il browser renderizza, quindi la lista di colori che materializza qui è
 * ESATTAMENTE quella che i chip mostrano — non due letture che possono divergere.
 */
export type BrandItem = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  logoAssetId: string | null;
  shortDescription: string | null;
  content: string | null;
};

const BRAND_COLUMNS = 'id, name, slug, website, logo_url, short_description, content';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
  if (!found) {
    throw error(404, 'questo progetto non esiste, o non è tuo');
  }

  const { orgId, project } = found;

  const { data, error: dbError } = await db
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('org_id', orgId)
    .eq('slug', params.slug ?? '')
    .maybeSingle();

  if (dbError) {
    throw error(500, dbError.message);
  }
  if (!data) {
    throw error(404, 'questo brand non esiste, o non è tuo');
  }

  const logoAsset = data.logo_url
    ? await findOrCreateImportedAsset(db, { orgId, type: 'image', url: data.logo_url })
    : null;

  const colourHexes = new Set(
    tokenizeChips(data.content ?? '')
      .filter((t): t is Extract<typeof t, { kind: 'colour' }> => t.kind === 'colour')
      .map((t) => t.hex)
  );

  const colourAssets = new Map<string, { assetId: string; url: string }>();
  for (const hex of colourHexes) {
    const found = await findOrCreateColourAsset(db, { orgId, hex });
    if (found) {
      colourAssets.set(hex, { assetId: found.asset.id, url: found.url });
    }
  }

  const brand: BrandItem = {
    id: data.id,
    name: data.name,
    slug: data.slug,
    website: data.website,
    logoUrl: data.logo_url,
    logoAssetId: logoAsset?.id ?? null,
    shortDescription: data.short_description,
    content: data.content
  };

  return {
    project: { id: project.id, name: project.name },
    brand,
    colourAssets: Object.fromEntries(colourAssets)
  };
};
