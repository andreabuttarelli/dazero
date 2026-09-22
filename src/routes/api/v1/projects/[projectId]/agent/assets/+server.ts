import { json } from '@sveltejs/kit';
import { listMemberships } from '$lib/server/repos/orgs';
import { listProjectAssets } from '$lib/server/repos/assets';
import { findProjectForUser } from '$lib/server/projects/lookup';
import type { RequestHandler } from './$types';

/**
 * I materiali del progetto per il pannello della sidebar. Session cookie, non Bearer: la rotta
 * `/media` pretende un token CLI e abbassarla per il cookie aprirebbe tutta la superficie CLI.
 *
 * GET → { assets: [{ id, type, url, content, mimeType, bytes, width, height, durationS, source, sourceNodeId, createdAt }] }
 */
const PANEL_LIMIT = 60;

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

  const assets = await listProjectAssets(db, { orgId: found.orgId, projectId: found.project.id });

  return json({ assets: assets.slice(0, PANEL_LIMIT) });
};
