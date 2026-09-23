import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { publisher } from '$lib/server/publishing';
import { listOrgBrands } from '$lib/server/repos/brands';
import { listBrandAccounts } from '$lib/server/repos/social-accounts';
import { listPosts } from '$lib/server/repos/posts';
import { deliveryStatus, scheduleDelivery, cancelDelivery } from '$lib/server/repos/post-delivery';
import { buildCalendarData } from './calendar-load';
import type { Db } from '$lib/server/db/client';

/**
 * IL CALENDARIO DEL PROGETTO: i post del suo brand, con lo stato di consegna letto da Zernio dal
 * vivo (mai una copia — vedi calendar-load.ts). `brand-shell.ts` (il `brand` che `+layout.server`
 * mette in `parent()`) legge colonne che sul database nuovo non esistono e torna sempre `null`
 * silenziosamente: questa rotta risolve il brand da sola, con `brands.ts` (colonne vere).
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
  const { project, org } = await parent();
  const db = await locals.db();
  if (!db) throw error(500, 'sessione senza client');

  const data = await buildCalendarData(
    { listOrgBrands, listBrandAccounts, listPosts, deliveryStatus },
    { orgId: org.id, brandId: project.brandId, db, publisher }
  );

  // Zernio irraggiungibile non è un errore di caricamento: deliveryStatus lo racconta PER POST
  // (`deliveries[].status === 'unreachable'`, con l'errore accanto) — mai una settimana vuota o
  // vecchia che finge di non avere niente programmato.
  return data;
};

/** L'org non arriva mai dal form: si risolve dal progetto nell'URL, come le altre azioni di
 *  questa cartella (`settings/brand/+page.server.ts::orgIdOfProject`) — un `orgId` inventato nel
 *  form non deve poter far leggere/scrivere un'altra org. */
async function requireDbAndOrg(event: RequestEvent): Promise<{ db: Db; orgId: string }> {
  const db = await event.locals.db();
  if (!db) throw error(500, 'sessione senza client');

  const { data } = await db.from('projects').select('org_id').eq('id', event.params.projectId ?? '').maybeSingle();
  const orgId = (data as { org_id: string } | null)?.org_id;
  if (!orgId) throw error(404, 'progetto non trovato');

  return { db, orgId };
}

export const actions: Actions = {
  schedule: async (event) => {
    const { db, orgId } = await requireDbAndOrg(event);
    const fd = await event.request.formData();
    const postId = String(fd.get('postId') ?? '');
    const accountIds = fd.getAll('accountId').map(String);
    const scheduledFor = String(fd.get('scheduledFor') ?? '').trim() || undefined;
    if (!postId || !accountIds.length) return fail(400, { error: 'post_and_accounts_required' });

    const result = await scheduleDelivery(db, publisher, { orgId, postId, accountIds, scheduledFor });
    return { scheduled: true, result };
  },

  publishNow: async (event) => {
    const { db, orgId } = await requireDbAndOrg(event);
    const fd = await event.request.formData();
    const postId = String(fd.get('postId') ?? '');
    const accountIds = fd.getAll('accountId').map(String);
    if (!postId || !accountIds.length) return fail(400, { error: 'post_and_accounts_required' });

    const result = await scheduleDelivery(db, publisher, { orgId, postId, accountIds });
    return { published: true, result };
  },

  cancel: async (event) => {
    const { db, orgId } = await requireDbAndOrg(event);
    const fd = await event.request.formData();
    const postId = String(fd.get('postId') ?? '');
    const accountId = String(fd.get('accountId') ?? '');
    if (!postId || !accountId) return fail(400, { error: 'post_and_account_required' });

    try {
      await cancelDelivery(db, publisher, { orgId, postId, accountId });
    } catch (e) {
      return fail(502, { error: 'cancel_failed', message: e instanceof Error ? e.message : 'unknown' });
    }
    return { canceled: true };
  },

  reschedule: async (event) => {
    const { db, orgId } = await requireDbAndOrg(event);
    const fd = await event.request.formData();
    const postId = String(fd.get('postId') ?? '');
    const accountId = String(fd.get('accountId') ?? '');
    const scheduledFor = String(fd.get('scheduledFor') ?? '').trim();
    if (!postId || !accountId || !scheduledFor) return fail(400, { error: 'post_account_and_time_required' });

    // Zernio non offre "sposta": cancella e riconsegna con il nuovo orario, stesso account.
    try {
      await cancelDelivery(db, publisher, { orgId, postId, accountId });
    } catch (e) {
      return fail(502, { error: 'reschedule_cancel_failed', message: e instanceof Error ? e.message : 'unknown' });
    }
    const result = await scheduleDelivery(db, publisher, { orgId, postId, accountIds: [accountId], scheduledFor });
    return { rescheduled: true, result };
  }
};
