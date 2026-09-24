import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createServiceRoleDb } from '$lib/server/db/client';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import { cronAuthorized } from '$lib/server/cron-auth';
import { expireStuckRuns, reconcileVideoNodeRuns } from '$lib/server/canvas/generate';
import { drainLoopQueue } from '$lib/server/canvas/loop';
import { pruneOldCanvasEvents } from '$lib/server/canvas/retention';
import { renewAccountSeats } from '$lib/server/account-billing';

const USE = SERVICE_ROLE_USES.find((u) => u.path.startsWith('src/routes/api/v1/canvas/runs/tick'))!;

/**
 * `maxDuration` ESPLICITO, come la rotta `run` in `+page.server.ts` (300s) — senza, questa
 * funzione girerebbe sul tetto di default della piattaforma, che su molti piani è molto meno di
 * quanto una sola generazione impiega (40-70s). Il tick gira ogni minuto (`vercel.json`); questo
 * tetto è quanto UN tick può durare, non quanto un loop intero impiega — quello lo drena su più
 * tick, che è esattamente il punto della coda.
 */
export const config = { maxDuration: 300 };

/** Quanti biglietti di loop un tick reclama — un lotto, mai la coda intera. A 40-70s per
 *  combinazione e un tetto di 300s per il tick INTERO (non solo il drain: c'è anche il
 *  riconciliatore video e lo sweep prima), 3 lascia margine reale invece di rincorrere il limite. */
const LOOP_DRAIN_BATCH = 3;

/**
 * QUATTRO COMPITI SULLO STESSO TICK, non quattro rotte: espira i run rimasti bloccati, riconcilia
 * i video in coda con il fornitore, drena un lotto della coda dei loop, pota gli eventi vecchi.
 * Nessuno merita un cron a sé — il progetto ne ha già troppi (`vercel.json`), e la regola è
 * estendere quello che gira già ogni minuto su questa tela invece di aggiungerne uno.
 *
 * `reconcileVideoNodeRuns` E `drainLoopQueue` vanno PRIMA di `expireStuckRuns`: un video appena
 * arrivato a `finishing`, o un biglietto di loop appena reclamato, non devono essere scambiati per
 * un giro scaduto dallo sweep che segue nello stesso tick — lo stesso motivo per cui
 * `expireStuckRuns` esclude comunque i biglietti ancora `queued` (vedi il suo commento), ma un
 * biglietto appena passato a `finishing` da questo stesso tick non è nemmeno più `running`, quindi
 * l'ordine qui è una difesa in profondità, non l'unica.
 */
export const GET: RequestHandler = async ({ request }) => {
  if (!cronAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleDb(USE);

  const videos = await reconcileVideoNodeRuns(db).catch((e) => {
    console.error('[canvas runs] video reconcile failed', e);
    return { checked: 0, done: 0, failed: 0, pending: 0 };
  });

  const loops = await drainLoopQueue(db, { limit: LOOP_DRAIN_BATCH }).catch((e) => {
    console.error('[canvas runs] loop drain failed', e);
    return { claimed: 0, done: 0, failed: 0 };
  });

  const runs = await expireStuckRuns(db).catch((e) => {
    console.error('[canvas runs] tick failed', e);
    return { expired: 0 };
  });

  const events = await pruneOldCanvasEvents(db).catch((e) => {
    console.error('[canvas events] prune failed', e);
    return { pruned: 0 };
  });

  // Idempotente per account+mese (l'indice unico su credit_ledger), quindi chiamarlo ogni minuto
  // è corretto — ma scorrere ogni account attivo ogni minuto è spreco puro dopo il primo addebito
  // del mese: gira solo al minuto 0 di ogni ora, non a ogni tick.
  const seats =
    new Date().getUTCMinutes() === 0
      ? await renewAccountSeats(db).catch((e) => {
          console.error('[account billing] seat renewal failed', e);
          return { charged: 0, paused: 0, alreadyCharged: 0 };
        })
      : { charged: 0, paused: 0, alreadyCharged: 0, skipped: true };

  return json({ ...runs, videos, loops, events, seats });
};

export const POST = GET;
