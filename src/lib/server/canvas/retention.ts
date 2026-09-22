import type { Db } from '$lib/server/db/client';

/**
 * LA POTATURA DI `canvas_events`: 30 giorni, un registro operativo, non un archivio
 * (NEW_DATABASE_STRUCTURE.md §12). Vive fuori da `repos/` di proposito — `tenancy.test.ts` esige
 * `org_id` su ogni scrittura di un repository perché la service role bypassa la RLS, ma una
 * potatura per età È cross-org per definizione: pota le righe vecchie di OGNI org nello stesso
 * giro, come già fa `expireStuckRuns` per i run scaduti. Tenerla in un repository la farebbe
 * sembrare una fuga di tenant; qui è dichiaratamente il compito di un cron.
 *
 * Un cron Vercel esistente (`api/v1/canvas/runs/tick`), non un secondo processo — l'utente è
 * stato esplicito, e la regola già scritta per `source-sync-tick.ts` vale identica qui: estendere
 * il tick che gira ogni minuto, non aggiungerne uno.
 */
export const CANVAS_EVENT_RETENTION_DAYS = 30;

export async function pruneOldCanvasEvents(
  db: Db,
  options: { retainDays?: number; now?: Date } = {}
): Promise<{ pruned: number }> {
  const retainDays = options.retainDays ?? CANVAS_EVENT_RETENTION_DAYS;
  const cutoff = new Date((options.now ?? new Date()).getTime() - retainDays * 24 * 60 * 60_000).toISOString();

  const { error, count } = await db.from('canvas_events').delete({ count: 'exact' }).lt('created_at', cutoff);

  if (error) {
    throw error;
  }
  return { pruned: count ?? 0 };
}
