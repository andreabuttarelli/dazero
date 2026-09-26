import { json } from '@sveltejs/kit';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { findOrCreateImportedAsset } from '$lib/server/repos/assets';
import type { RequestHandler } from './$types';

/**
 * I BRAND DELL'ORG, PER LA SIDEBAR — draggabili sulla tela che è già aperta, come `brands/+page`.
 * `brands` non porta `project_id` (vedi CLAUDE.md): questa rotta mostra ogni brand dell'org del
 * progetto aperto, non solo quello a cui il progetto è collegato.
 *
 * `logoAssetId` NASCE QUI, come in `brands/+page.server.ts`: un nodo statico ha bisogno di
 * `data.assetId` (`uploaded-node.ts`), e `dragstart` è sincrono — non può aspettare un giro al
 * server. `findOrCreateImportedAsset` è idempotente.
 *
 * Session cookie, non Bearer — stesso motivo di `agent/assets`.
 *
 * GET → { brands: [{ id, name, slug, logoUrl, logoAssetId, shortDescription, content }] }
 */
const BRAND_COLUMNS = 'id, name, slug, logo_url, short_description, content';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = await locals.db();
  if (!db) {
    return json({ error: 'no_client' }, { status: 500 });
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findProjectForUser(db, { projectId: params.projectId ?? '', memberships });
  if (!found) {
    return json({ error: 'project_not_found' }, { status: 404 });
  }

  const { orgId } = found;

  const { data, error } = await db
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (error) {
    return json({ error: 'query_failed' }, { status: 500 });
  }

  const brands = await Promise.all(
    (data ?? []).map(async (row) => {
      const logoAsset = row.logo_url
        ? await findOrCreateImportedAsset(db, { orgId, type: 'image', url: row.logo_url })
        : null;

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logo_url,
        logoAssetId: logoAsset?.id ?? null,
        shortDescription: row.short_description,
        content: row.content
      };
    })
  );

  return json({ brands });
};
