import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { findCanvasForUser } from '$lib/server/canvas/lookup';
import { listMemberships } from '$lib/server/repos/orgs';
import { findAsset } from '$lib/server/repos/assets';
import { signKnowledgePaths } from '$lib/server/media-archive';
import { signAssetFile } from '$lib/server/repos/asset-storage';

/**
 * UN ASSET DI UNA TELA, CON LA FIRMA DEL MOMENTO.
 *
 * `/c/<canvasId>/assets/<id>`: l'id da solo non basta, perché la tela va aperta per sapere che è
 * tua — e un asset senza la sua tela sarebbe un file di chiunque. La firma non si conserva: dura
 * due ore, e una tela lasciata aperta tutto il giorno mostrerebbe riquadri rotti.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findCanvasForUser(db, { canvasId: params.canvasId ?? '', memberships });
  if (!found) {
    throw error(404, 'questa tela non esiste, o non è tua');
  }

  const asset = await findAsset(db, { orgId: found.orgId, assetId: params.id ?? '' });
  if (!asset) {
    throw error(404, 'asset non trovato');
  }

  if (asset.type === 'text' && asset.content !== null) {
    return new Response(asset.content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  const path = asset.url ?? '';
  if (!path) {
    throw error(404, 'asset senza file');
  }

  // `source` dice il bucket: un upload sta su canvas-assets, un disegno di modello su brand-knowledge.
  const signed =
    asset.source === 'generated'
      ? ((await signKnowledgePaths(db as never, [path])).get(path) ?? null)
      : await signAssetFile(db, path).catch(() => null);

  if (!signed) {
    throw error(404, 'file non trovato');
  }

  return new Response(null, {
    status: 302,
    headers: { Location: signed, 'Cache-Control': 'no-store' }
  });
};
