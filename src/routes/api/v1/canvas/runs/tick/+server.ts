import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createServiceRoleDb } from '$lib/server/db/client';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import { cronAuthorized } from '$lib/server/cron-auth';
import { expireStuckRuns } from '$lib/server/canvas/generate';
import { tickSourceSync } from '$lib/server/canvas/source-sync-tick';
import { pruneOldCanvasEvents } from '$lib/server/canvas/retention';

// Un giro di sincronizzazione di uno store o di un feed social può restare sotto ai 60s (Shopify
// pagina 250 prodotti alla volta, ScrapeCreators risponde in un colpo solo) — resta comunque il
// tetto della rotta che genera i run scaduti, non un tetto nuovo.
export const config = { maxDuration: 60 };

const USE = SERVICE_ROLE_USES.find((u) => u.path.startsWith('src/routes/api/v1/canvas/runs/tick'))!;

/**
 * DUE COMPITI SULLO STESSO TICK, non due rotte: `products`/`social_account_feed` non hanno
 * bisogno di un cron ogni minuto — sincronizzarli è raro (`SOURCE_SYNC_STALE_MS`, sei ore) — ma
 * il progetto ha già troppi cron (`vercel.json`), e la regola è estendere quello che gira già
 * ogni minuto su questa tela invece di aggiungerne un secondo. `tickSourceSync` interroga i nodi
 * scaduti e non fa niente quando non ce ne sono — il costo di un minuto vuoto è una select sola.
 */
export const GET: RequestHandler = async ({ request }) => {
  if (!cronAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleDb(USE);

  const runs = await expireStuckRuns(db).catch((e) => {
    console.error('[canvas runs] tick failed', e);
    return { expired: 0 };
  });

  const sources = await tickSourceSync(db).catch((e) => {
    console.error('[canvas source sync] tick failed', e);
    return { checked: 0, synced: 0, failed: 0 };
  });

  const events = await pruneOldCanvasEvents(db).catch((e) => {
    console.error('[canvas events] prune failed', e);
    return { pruned: 0 };
  });

  return json({ ...runs, sources, events });
};

export const POST = GET;
