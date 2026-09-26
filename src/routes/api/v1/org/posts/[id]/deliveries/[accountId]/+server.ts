import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { publisher } from '$lib/server/publishing';
import { cancelDelivery } from '$lib/server/repos/post-delivery';

/**
 * Cancella la consegna di un post su UN account — cancella su Zernio prima di togliere il
 * puntatore locale (vedi post-delivery.ts). Rischedulare è la stessa cosa: cancella e riconsegna
 * con un nuovo `scheduled_for` — Zernio non offre un endpoint "sposta" separato.
 */
export const DELETE: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  try {
    await cancelDelivery(db, publisher, {
      orgId,
      postId: params.id ?? '',
      accountId: params.accountId ?? ''
    });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('post_not_found')) {
      return json({ error: 'post_not_found' }, { status: 404 });
    }
    return json({ error: 'cancel_failed', message: e instanceof Error ? e.message : 'unknown' }, { status: 502 });
  }
};
