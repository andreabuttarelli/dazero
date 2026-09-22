import { json } from '@sveltejs/kit';
import { listMemberships } from '$lib/server/repos/orgs';
import { findProjectForUser } from '$lib/server/projects/lookup';
import { listInfluencers, listInfluencerViewsByIds, signInfluencerViewFiles } from '$lib/server/repos/influencers';
import type { RequestHandler } from './$types';

/**
 * IL CATALOGO + I PROPRI, PER LA SIDEBAR — draggabili sulla tela che è già aperta, come
 * `agent/brands` e `agent/assets`. `listInfluencers` porta già le due platee insieme (RLS), qui
 * si aggiunge solo la prima vista firmata per fare da miniatura — non tutte, il pannello mostra
 * una card, non un carosello.
 *
 * Session cookie, non Bearer — stesso motivo di `agent/assets`/`agent/brands`.
 *
 * GET → { influencers: [{ id, name, source, gender, age, ethnicity, bodyType, coverUrl }] }
 */
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

  const rows = await listInfluencers(db);
  const viewsByInfluencer = await listInfluencerViewsByIds(db, rows.map((r) => r.id));

  const coverPaths = rows
    .map((r) => viewsByInfluencer.get(r.id)?.[0]?.storagePath)
    .filter((p): p is string => Boolean(p));
  const signed = await signInfluencerViewFiles(db, coverPaths);

  const influencers = rows.map((r) => {
    const cover = viewsByInfluencer.get(r.id)?.[0] ?? null;
    return {
      id: r.id,
      name: r.name,
      source: r.source,
      gender: r.gender,
      age: r.age,
      ethnicity: r.ethnicity,
      bodyType: r.bodyType,
      coverUrl: cover ? (signed.get(cover.storagePath) ?? null) : null
    };
  });

  return json({ influencers });
};
