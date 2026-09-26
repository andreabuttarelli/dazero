import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { findPost, setPostStatus, POST_STATUSES, type PostStatus } from '$lib/server/repos/posts';

/**
 * Solo lo STATO di un post — `draft → ready → archived`, il ciclo redazionale. Pubblicare o
 * programmare una consegna è un altro mestiere, e vive in `[id]/deliveries` — Zernio è l'unica
 * fonte di verità su quando esce e con che stato, questa rotta non la tocca.
 */
export const PATCH: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !POST_STATUSES.includes(body.status as PostStatus)) {
    return json({ error: 'invalid_status', valid: POST_STATUSES }, { status: 400 });
  }

  const existing = await findPost(db, { orgId, postId: params.id ?? '' });
  if (!existing) return json({ error: 'post_not_found' }, { status: 404 });

  await setPostStatus(db, { orgId, postId: existing.id, status: body.status as PostStatus });

  return json({ ok: true, id: existing.id, status: body.status });
};
