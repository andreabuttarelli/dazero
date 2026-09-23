import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createServiceRoleDb } from '$lib/server/db/client';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import { cronAuthorized } from '$lib/server/cron-auth';
import { expireStuckRuns, reconcileVideoNodeRuns } from '$lib/server/canvas/generate';
import { pruneOldCanvasEvents } from '$lib/server/canvas/retention';

const USE = SERVICE_ROLE_USES.find((u) => u.path.startsWith('src/routes/api/v1/canvas/runs/tick'))!;

/**
 * TRE COMPITI SULLO STESSO TICK, non tre rotte: espira i run rimasti bloccati, riconcilia i
 * video in coda con il fornitore, e pota gli eventi vecchi. Nessuno merita un cron a sé — il
 * progetto ne ha già troppi (`vercel.json`), e la regola è estendere quello che gira già ogni
 * minuto su questa tela invece di aggiungerne uno.
 *
 * `reconcileVideoNodeRuns` va PRIMA di `expireStuckRuns`: un video appena arrivato a `finishing`
 * (il claim atomico dentro il riconciliatore) non deve essere scambiato per un giro scaduto dal
 * sweep che segue nello stesso tick.
 */
export const GET: RequestHandler = async ({ request }) => {
  if (!cronAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleDb(USE);

  const videos = await reconcileVideoNodeRuns(db).catch((e) => {
    console.error('[canvas runs] video reconcile failed', e);
    return { checked: 0, done: 0, failed: 0, pending: 0 };
  });

  const runs = await expireStuckRuns(db).catch((e) => {
    console.error('[canvas runs] tick failed', e);
    return { expired: 0 };
  });

  const events = await pruneOldCanvasEvents(db).catch((e) => {
    console.error('[canvas events] prune failed', e);
    return { pruned: 0 };
  });

  return json({ ...runs, videos, events });
};

export const POST = GET;
