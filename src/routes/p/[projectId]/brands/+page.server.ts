import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { findOrCreateImportedAsset } from '$lib/server/repos/assets';

/**
 * I BRAND DELL'ORG, TRASCINABILI SULLA TELA.
 *
 * `brands` non porta `project_id`: un brand è dell'org, non del progetto — lo stesso motivo per
 * cui `projects.brand_id` è nullable (vedi CLAUDE.md). Questa pagina mostra ogni brand dell'org
 * del progetto aperto, non solo quello a cui il progetto è collegato: si trascina il logo di un
 * brand diverso su una tela di esplorazione tanto quanto quello del progetto stesso.
 *
 * `logoAssetId` NASCE QUI, NON AL TRASCINAMENTO. Un nodo statico ha bisogno di `data.assetId`
 * (vedi `uploaded-node.ts`), e `dragstart` scrive `dataTransfer` in modo sincrono — non può
 * aspettare un giro al server. `findOrCreateImportedAsset` (idempotente) prepara la riga qui,
 * una volta per pagina, così il trascinamento ha già tutto quel che gli serve in mano.
 */
export type BrandCard = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  logoAssetId: string | null;
  shortDescription: string | null;
  content: string | null;
};

const BRAND_COLUMNS = 'id, name, slug, logo_url, short_description, content';

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
    .order('name', { ascending: true });

  if (dbError) {
    throw error(500, dbError.message);
  }

  const brands: BrandCard[] = await Promise.all(
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

  return {
    project: { id: project.id, name: project.name, slug: project.slug },
    brands
  };
};
