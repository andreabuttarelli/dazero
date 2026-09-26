import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveOrgCaller } from '$lib/server/org-data/auth';
import { publisher } from '$lib/server/publishing';
import { deliveryStatus, scheduleDelivery } from '$lib/server/repos/post-delivery';

/**
 * LE CONSEGNE DI UN POST — schedulare, pubblicare subito, e leggerne lo stato. Zernio è l'unica
 * fonte di verità (decisione utente, 2026-09-22): GET chiede a Zernio per ogni account già
 * consegnato, non legge uno `status` nostro. POST senza `scheduled_for` pubblica subito
 * (`publishNow` lato Zernio); con `scheduled_for` lo programma e Zernio lo tiene fino all'ora.
 */
export const GET: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId } = resolved.caller;

  try {
    const deliveries = await deliveryStatus(db, publisher, { orgId, postId: params.id ?? '' });
    return json({ deliveries });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('post_not_found')) {
      return json({ error: 'post_not_found' }, { status: 404 });
    }
    throw e;
  }
};

export const POST: RequestHandler = async ({ request, params, url }) => {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const resolved = await resolveOrgCaller(bearer, url.searchParams.get('org') ?? undefined);
  if ('error' in resolved) return json(resolved.error.body, { status: resolved.error.status });

  const { db, orgId, writeAllowed } = resolved.caller;
  if (!writeAllowed) return json({ error: 'api_key_read_only' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    account_ids?: string[];
    scheduled_for?: string;
  };

  if (!body.account_ids?.length) {
    return json({ error: 'account_ids_required' }, { status: 400 });
  }

  try {
    const result = await scheduleDelivery(db, publisher, {
      orgId,
      postId: params.id ?? '',
      accountIds: body.account_ids,
      scheduledFor: body.scheduled_for
    });
    return json(result);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('post_not_found')) {
      return json({ error: 'post_not_found' }, { status: 404 });
    }
    throw e;
  }
};
