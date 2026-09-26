import { json } from '@sveltejs/kit';
import { listMemberships } from '$lib/server/repos/orgs';
import { listProjectAssets, type Asset } from '$lib/server/repos/assets';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { signAssetFiles } from '$lib/server/repos/asset-storage';
import { signKnowledgePaths } from '$lib/server/media-archive';
import type { Db } from '$lib/server/db/client';
import type { RequestHandler } from './$types';

/**
 * I MATERIALI DEL PROGETTO PER LA SIDEBAR — draggabili sulla tela che è già aperta.
 *
 * Session cookie, non Bearer: la rotta `/media` pretende un token CLI e abbassarla per il
 * cookie aprirebbe tutta la superficie CLI (stesso motivo del pannello brand-agent gemello).
 *
 * `signedUrl` VIAGGIA ACCANTO A `url`, non al posto suo — stessa forma di `MediaAsset`
 * (`assets/+page.server.ts`): `assetDrag` (`drag-payload.ts`) legge `url` per il nome del file e
 * `signedUrl` per dove il nodo statico punterà, ed è sincrono al `dragstart` — non può aspettare
 * un giro al server per firmare lì. Due bucket, come nella libreria del progetto: `canvas-assets`
 * per un upload, `brand-knowledge` per un render.
 *
 * GET → { assets: [{ id, type, url, signedUrl, content, mimeType, bytes, width, height, durationS, source, sourceNodeId, createdAt }] }
 */
const PANEL_LIMIT = 60;

async function withSignedUrls(db: Db, assets: Asset[]): Promise<Map<string, string>> {
  const uploadPaths = assets.filter((a) => a.source === 'upload' && a.url).map((a) => a.url!);
  const generatedPaths = assets.filter((a) => a.source === 'generated' && a.url).map((a) => a.url!);

  const [uploaded, generated] = await Promise.all([
    signAssetFiles(db, uploadPaths),
    signKnowledgePaths(db as never, generatedPaths)
  ]);

  return new Map([...uploaded, ...generated]);
}

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

  const assets = (
    await listProjectAssets(db, { orgId: found.orgId, projectId: found.project.id })
  ).slice(0, PANEL_LIMIT);
  const signedUrls = await withSignedUrls(db, assets);

  return json({
    assets: assets.map((asset) => ({
      ...asset,
      signedUrl: asset.url ? (signedUrls.get(asset.url) ?? null) : null
    }))
  });
};
