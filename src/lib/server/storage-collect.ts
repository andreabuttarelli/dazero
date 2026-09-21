/**
 * IL RACCOGLITORE DI ORFANI, e la parte che cancella è l'eccezione, non il default.
 *
 * Questo modulo non decide niente: la decisione sta in `storage-refs.ts`, è pura e ha i suoi test.
 * Qui c'è solo l'andata e ritorno con il database e con lo Storage, tenuta separata proprio perché
 * la regola «questo file è orfano» si possa provare senza una rete.
 *
 * SOLA LETTURA FINCHÉ NON SI CHIEDE IL CONTRARIO. `mode: 'report'` è il valore di partenza e non
 * un'opzione fra pari: un raccoglitore cancella dati veri di clienti veri, e la prima misura fatta
 * su questo bucket diceva 8.022 orfani su 8.054 — falsa, perché guardava una tabella sola. Chi
 * accende `mode: 'collect'` lo fa dopo aver letto l'elenco, non prima.
 *
 * L'INVENTARIO SI LEGGE DA `storage.objects`. Non è un dettaglio di implementazione scelto per
 * comodità: è l'unica lista che esiste. `storage.objects` sono i METADATI in Postgres, i byte stanno
 * su S3, e per questo una riga tolta a mano — o un trigger che cancellasse in cascata — lascerebbe
 * il file pagato e IRRAGGIUNGIBILE: un orfano peggiore di quello che si voleva togliere. I byte si
 * tolgono solo dall'API dello Storage, che è quello che fa `removeOrphans`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { swallow } from '$lib/server/swallow';
import {
  STORAGE_REFS,
  COLLECTABLE_AREAS,
  COLLECT_MAX_FILES,
  ORPHAN_GRACE_MS,
  pathsInRow,
  refKey,
  orphansAmong,
  type Orphan,
  type StorageFile
} from '$lib/server/storage-refs';

/** Quante righe per pagina quando si legge una tabella intera di riferimenti. */
const REF_PAGE = 1000;

/** Quanti file elencare nel report: abbastanza per giudicare, non tanti da non leggerli. */
export const REPORT_SAMPLE = 50;

/** Quanti path accetta una sola `remove()`. Oltre, lo Storage rifiuta la richiesta intera. */
const REMOVE_BATCH = 100;

export type CollectMode = 'report' | 'collect';

export type CollectReport = {
  mode: CollectMode;
  scanned: number;
  referenced: number;
  too_young: number;
  out_of_scope: number;
  orphans: number;
  capped: number;
  sample: Orphan[];
  removed: number;
  covered_areas: string[];
  grace_hours: number;
  ceiling: number;
};

/**
 * Ogni path che una riga viva nomina, in tutte le tabelle del registro.
 *
 * Si legge TUTTO prima di giudicare qualunque file: un insieme di riferimenti parziale trasforma
 * righe vive in orfani, e un errore di lettura qui deve fermare il giro invece di restringerlo in
 * silenzio — è esattamente il modo in cui una misura ingenua arriva a proporre un bucket intero.
 */
export async function referencedPaths(
  supabase: SupabaseClient
): Promise<{ paths: Set<string>; error: string | null }> {
  const paths = new Set<string>();

  for (const rule of STORAGE_REFS) {
    for (let from = 0; ; from += REF_PAGE) {
      const { data, error } = await supabase
        .from(rule.table)
        .select(rule.columns.join(', '))
        .range(from, from + REF_PAGE - 1);

      if (error) return { paths, error: `${rule.table}: ${error.message}` };

      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const row of rows) {
        for (const ref of pathsInRow(rule, row)) paths.add(refKey(ref.bucket, ref.path));
      }

      if (rows.length < REF_PAGE) break;
    }
  }

  return { paths, error: null };
}

/**
 * L'inventario dei file, e SOLO dei bucket che il registro sa leggere. Un bucket assente da
 * `COLLECTABLE_AREAS` non viene nemmeno elencato: quel che non si guarda non si può cancellare
 * per sbaglio.
 */
export async function listCoveredFiles(
  supabase: SupabaseClient
): Promise<{ files: StorageFile[]; error: string | null }> {
  const buckets = [...new Set(COLLECTABLE_AREAS.map((a) => a.bucket))];
  const files: StorageFile[] = [];

  for (const bucket of buckets) {
    const { data, error } = await supabase
      .schema('storage')
      .from('objects')
      .select('name, created_at, bucket_id')
      .eq('bucket_id', bucket);

    if (error) return { files, error: `${bucket}: ${error.message}` };

    for (const row of (data ?? []) as Array<{ name: string; created_at: string }>) {
      files.push({ bucket, path: row.name, createdAt: row.created_at });
    }
  }

  return { files, error: null };
}

async function removeOrphans(supabase: SupabaseClient, orphans: Orphan[]): Promise<number> {
  const byBucket = new Map<string, string[]>();
  for (const orphan of orphans) {
    byBucket.set(orphan.bucket, [...(byBucket.get(orphan.bucket) ?? []), orphan.path]);
  }

  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      try {
        const { error } = await supabase.storage.from(bucket).remove(batch);
        if (error) {
          swallow('collect orphans', error);
          continue;
        }
        removed += batch.length;
      } catch (error) {
        swallow('collect orphans', error);
      }
    }
  }

  return removed;
}

export async function collectOrphans(
  supabase: SupabaseClient,
  opts: { mode?: CollectMode; now?: number } = {}
): Promise<CollectReport | { error: string }> {
  const mode = opts.mode ?? 'report';

  const refs = await referencedPaths(supabase);
  if (refs.error) return { error: `cannot read references — nothing was touched: ${refs.error}` };

  const inventory = await listCoveredFiles(supabase);
  if (inventory.error) return { error: `cannot list storage — nothing was touched: ${inventory.error}` };

  const scan = orphansAmong({
    now: opts.now ?? Date.now(),
    files: inventory.files,
    referenced: refs.paths
  });

  const removed = mode === 'collect' ? await removeOrphans(supabase, scan.orphans) : 0;

  return {
    mode,
    scanned: inventory.files.length,
    referenced: scan.referenced,
    too_young: scan.tooYoung,
    out_of_scope: scan.outOfScope,
    orphans: scan.orphans.length,
    capped: scan.capped,
    sample: scan.orphans.slice(0, REPORT_SAMPLE),
    removed,
    covered_areas: COLLECTABLE_AREAS.map((a) => `${a.bucket}/${a.area}`),
    grace_hours: ORPHAN_GRACE_MS / (60 * 60 * 1000),
    ceiling: COLLECT_MAX_FILES
  };
}
