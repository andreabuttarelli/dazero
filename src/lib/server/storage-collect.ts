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
 *
 * Ma `storage` NON è uno schema esposto da PostgREST — solo `public` e `graphql_public` lo sono —
 * e perciò si passa per `public.storage_objects_page`, la funzione della migrazione
 * `20260921170000`. Finché quella migrazione non è applicata questo raccoglitore risponde errore
 * su OGNI giro, che è esattamente quel che faceva prima senza che nessuno lo avesse notato.
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

/**
 * Quante righe per pagina. Deve valere ESATTAMENTE il `max-rows` di PostgREST (1.000 qui, misurato:
 * `?limit=5000` su `market_posts` risponde `content-range: 0-999/37444`). Chiederne di più non ne
 * porta di più e fa credere finita una lettura che è stata troncata; chiederne di meno moltiplica
 * i giri senza guadagnare niente.
 */
const PAGE_ROWS = 1000;

/**
 * Il tetto di righe che una sola lettura accetta di percorrere. Non è un'ottimizzazione: è il
 * modo di NON restare in un ciclo infinito se una pagina smettesse di rimpicciolirsi, e il modo
 * di accorgersi che una tabella è cresciuta oltre quel che questo giro sa leggere. Superarlo è un
 * errore, mai un insieme più piccolo — vedi `readAllRows`.
 */
export const MAX_REF_ROWS = 200_000;

/** Quanti file elencare nel report: abbastanza per giudicare, non tanti da non leggerli. */
export const REPORT_SAMPLE = 50;

/** Quanti path accetta una sola `remove()`. Oltre, lo Storage rifiuta la richiesta intera. */
const REMOVE_BATCH = 100;

/**
 * UNA LETTURA INTERA, o un errore. Mai una lettura parziale che sembra intera.
 *
 * Due difetti abitano qui, e sbagliano in direzioni opposte:
 *
 *   l'INVENTARIO troncato SOTTOSTIMA — un file che la lettura non vede non viene proposto, quindi
 *   si sbaglia dalla parte sicura ma il report mente sulla sua portata (`wall` ha 20.917 oggetti:
 *   una lettura senza pagine ne vedeva 1.000);
 *
 *   i RIFERIMENTI troncati CANCELLANO FILE VIVI — un path nominato da una riga che la query non
 *   ha letto sembra orfano. `market_posts` ha 37.444 righe, trentasette pagine: fermarsi alla
 *   prima proponeva per la cancellazione quasi tutto il bucket `wall`.
 *
 * Perciò l'ordine TOTALE non è un dettaglio di stile. Senza `order`, due `range` consecutivi sono
 * due query indipendenti e Postgres non promette che restituiscano la stessa sequenza: una riga
 * può ricomparire nella pagina dopo, e — il caso che costa — può non comparire in nessuna. Una
 * riga saltata nella lettura dei riferimenti è un file vivo proposto per la cancellazione, che è
 * esattamente il difetto contro cui l'intero modulo è scritto. Con quali colonne si ordina lo dice
 * `orderBy` della regola, perché non è `id` dappertutto: `social_thumb_cache` ha per chiave
 * `(platform, handle)` e di `id` non ne ha affatto.
 */
async function readAllRows(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<{ rows: Array<Record<string, unknown>>; error: string | null }> {
  const rows: Array<Record<string, unknown>> = [];

  for (let from = 0; from < MAX_REF_ROWS; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { rows, error: error.message };

    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);

    if (batch.length < PAGE_ROWS) return { rows, error: null };
  }

  return { rows, error: `more than ${MAX_REF_ROWS} rows — the read cannot be proven complete` };
}

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
    const { rows, error } = await readAllRows((from, to) => {
      let query = supabase.from(rule.table).select(rule.columns.join(', '));
      for (const column of rule.orderBy) query = query.order(column, { ascending: true });
      return query.range(from, to);
    });

    if (error) return { paths, error: `${rule.table}: ${error}` };

    for (const row of rows) {
      for (const ref of pathsInRow(rule, row)) paths.add(refKey(ref.bucket, ref.path));
    }
  }

  return { paths, error: null };
}

/**
 * L'inventario dei file, e SOLO dei bucket che il registro sa leggere. Un bucket assente da
 * `COLLECTABLE_AREAS` non viene nemmeno elencato: quel che non si guarda non si può cancellare
 * per sbaglio.
 *
 * Passa da una funzione di `public` e non da `schema('storage')` perché PostgREST espone soltanto
 * `public` e `graphql_public`: `supabase.schema('storage')` risponde PGRST106 SEMPRE, e per questo
 * il raccoglitore non ha mai prodotto un report in vita sua. I 582 orfani citati nella storia di
 * questo modulo vennero da SQL scritto a mano, non da questo codice.
 */
export async function listCoveredFiles(
  supabase: SupabaseClient
): Promise<{ files: StorageFile[]; error: string | null }> {
  const buckets = [...new Set(COLLECTABLE_AREAS.map((a) => a.bucket))];
  const files: StorageFile[] = [];

  for (const bucket of buckets) {
    const { rows, error } = await readAllRows((from, to) =>
      supabase.rpc('storage_objects_page', {
        p_bucket: bucket,
        p_from: from,
        p_limit: to - from + 1
      })
    );

    if (error) return { files, error: `${bucket}: ${error}` };

    for (const row of rows as Array<{ name: string; created_at: string }>) {
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
