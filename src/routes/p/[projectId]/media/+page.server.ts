import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { listProjectAssets, type Asset } from '$lib/server/repos/assets';
import { listNodesByIds } from '$lib/server/repos/canvas';
import { signAssetFiles } from '$lib/server/repos/asset-storage';
import { signKnowledgePaths } from '$lib/server/media-archive';
import { parseAssetSourceFilter } from './asset-filter';

/**
 * LA LIBRERIA MEDIA DI UN PROGETTO, SULLO SCHEMA NUOVO.
 *
 * Ogni asset porta già `source` e `source_node_id` — non c'è una cartella o un tag da inventare,
 * il filtro è la vetrina su una colonna che esiste già. Il filtro sta nella QUERY
 * (`listProjectAssets` prende `source`), non in un `.filter()` lato client: un progetto accumula
 * migliaia di asset e la pagina non li scarica tutti per poi scartarne due terzi.
 *
 * Due bucket, perché due sono le strade che un asset percorre per arrivare qui:
 * `canvas-assets` per un upload, `brand-knowledge` per un render — `assets/[id]/+server.ts`
 * nella tela decide allo stesso modo, guardando `source`.
 *
 * `parseAssetSourceFilter` vive nel suo file: `+page.server.ts` accetta solo gli export che
 * SvelteKit conosce, e uno in più fa cadere la rotta con un 500 prima ancora di girare.
 */
export type MediaAsset = Asset & {
  signedUrl: string | null;
  sourceNode: { id: string; displayName: string | null; canvasId: string } | null;
};

async function withSignedUrls(
  locals: App.Locals,
  assets: Asset[]
): Promise<Map<string, string>> {
  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const uploadPaths = assets.filter((a) => a.source === 'upload' && a.url).map((a) => a.url!);
  const generatedPaths = assets.filter((a) => a.source === 'generated' && a.url).map((a) => a.url!);

  const [uploaded, generated] = await Promise.all([
    signAssetFiles(db, uploadPaths),
    signKnowledgePaths(db as never, generatedPaths)
  ]);

  return new Map([...uploaded, ...generated]);
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
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
  const source = parseAssetSourceFilter(url.searchParams.get('source'));

  const assets = await listProjectAssets(db, { orgId, projectId: project.id, source });

  const nodeIds = [...new Set(assets.map((a) => a.sourceNodeId).filter((id): id is string => !!id))];
  const [signedUrls, nodes] = await Promise.all([
    withSignedUrls(locals, assets),
    listNodesByIds(db, { orgId, nodeIds })
  ]);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const items: MediaAsset[] = assets.map((asset) => {
    const node = asset.sourceNodeId ? nodesById.get(asset.sourceNodeId) : undefined;
    return {
      ...asset,
      signedUrl: asset.url ? (signedUrls.get(asset.url) ?? null) : null,
      sourceNode: node
        ? { id: node.id, displayName: node.displayName, canvasId: node.canvasId }
        : null
    };
  });

  return {
    project: { id: project.id, name: project.name, slug: project.slug },
    items,
    filter: source ?? 'all'
  };
};
