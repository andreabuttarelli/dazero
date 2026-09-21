/**
 * LA STORIA DI UN NODO CHE PRODUCE, scritta e riletta.
 *
 * Accanto a `canvas-gen.ts` e con la stessa divisione per intenzione: lì si scrive COSA si chiede
 * — medium, modello, prompt, parametri — qui COSA È USCITO. Con una funzione sola il salvataggio
 * di un prompt mentre lo si scrive toccherebbe anche la storia, e la storia è un registro di fatti
 * avvenuti: non si riscrive perché qualcuno ha cambiato idea sulla prossima frase.
 *
 * L'ORDINE È IL DIFETTO CHE QUESTE FUNZIONI CHIUDONO. Spostare `ref_id` per primo e scrivere la
 * riga di storia dopo significa che, se la seconda scrittura fallisce, la generazione di prima è
 * irrecuperabile dal nodo — esattamente il difetto per cui questa tabella esiste. Prima la storia,
 * poi la vetrina: nel caso peggiore resta un giro registrato che il nodo non mostra, che è
 * recuperabile con un clic sulla striscia.
 *
 * I CONTROLLI PRIMA DELLA SCRITTURA, come ovunque su questa tela: i vincoli del database bocciano
 * comunque, ma con un SQLSTATE che non dice niente a chi ha solo premuto un bottone.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenRun } from '$lib/canvas/gen-node';

const RUNS_TABLE = 'brand_canvas_item_runs';
const ITEMS_TABLE = 'brand_canvas_items';

/** Le colonne che una riga di storia porta fuori: abbastanza per la striscia, non l'asset intero. */
const RUN_COLUMNS = 'id, item_id, media_id, prompt, model, params, created_at';

type RunRow = {
  id: string;
  item_id?: string;
  media_id: string | null;
  prompt: string | null;
  model: string | null;
  created_at: string;
};

function toRun(row: RunRow): GenRun {
  return {
    id: row.id,
    mediaId: row.media_id,
    prompt: row.prompt ?? '',
    model: row.model,
    createdAt: row.created_at
  };
}

export type RecordGenRun = {
  brandId: string;
  userId: string;
  itemId: string;
  /** L'asset appena prodotto. Null quando il giro non ne ha ancora uno: non si registra. */
  mediaId: string | null;
  prompt: string;
  model: string | null;
  params: Record<string, unknown>;
};

/**
 * Un giro atterrato: entra in storia, e diventa quello che si vede.
 *
 * SENZA ASSET NON SI REGISTRA NIENTE. Un clip parte e atterra minuti dopo: una riga con
 * `media_id` null sarebbe una miniatura che non si può aprire, e `ref_id` spostato su null
 * cancellerebbe dallo schermo il risultato precedente in cambio di niente.
 */
export async function recordGenRun(
  supabase: SupabaseClient,
  input: RecordGenRun
): Promise<{ ok: true; run: GenRun } | { ok: false; error: string }> {
  if (!input.itemId) {
    return { ok: false, error: 'item_id è obbligatorio' };
  }
  if (!input.mediaId) {
    return { ok: false, error: 'nessun asset da registrare' };
  }

  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .insert({
      item_id: input.itemId,
      brand_id: input.brandId,
      media_id: input.mediaId,
      prompt: input.prompt,
      model: input.model,
      params: input.params,
      created_by: input.userId
    })
    .select(RUN_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const row = data as RunRow | null;
  if (!row) return { ok: false, error: 'esecuzione non registrata' };

  const shown = await showMedia(supabase, input.brandId, input.itemId, input.mediaId);
  if (!shown.ok) return shown;

  return { ok: true, run: toRun(row) };
}

/**
 * Tornare a un giro di prima. L'asset NON arriva da chi chiede: si rilegge dalla riga di storia
 * che quel nodo possiede. Senza questo giro in più un `media_id` indovinato appiccicherebbe
 * l'asset di un altro nodo a questo, e la tela mostrerebbe una cosa che quel nodo non ha fatto.
 */
export async function showGenRun(
  supabase: SupabaseClient,
  input: { brandId: string; itemId: string; runId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.itemId || !input.runId) {
    return { ok: false, error: 'item_id e run_id sono obbligatori' };
  }

  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select(RUN_COLUMNS)
    .in('item_id', [input.itemId])
    .order('created_at');

  if (error) return { ok: false, error: error.message };

  const run = ((data ?? []) as RunRow[]).find((r) => r.id === input.runId);
  if (!run?.media_id) return { ok: false, error: 'esecuzione non trovata' };

  return showMedia(supabase, input.brandId, input.itemId, run.media_id);
}

/**
 * Il filtro sul brand accanto a quello sull'id: l'id arriva da chi manda la richiesta, e le RLS lo
 * fermerebbero comunque — ma un rifiuto che nomina la riga vale più di uno che dice zero righe
 * aggiornate. È la stessa scelta di `saveGenNode`.
 */
async function showMedia(
  supabase: SupabaseClient,
  brandId: string,
  itemId: string,
  mediaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(ITEMS_TABLE)
    .update({ ref_id: mediaId })
    .eq('id', itemId)
    .eq('brand_id', brandId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * La storia di tutti i nodi di una tela, in un giro solo. Una query per nodo sarebbe N+1 su una
 * tela che per definizione ne ha molti — la stessa ragione per cui `loadCanvasItems` idrata per
 * tipo e non per tile.
 */
export async function loadGenRuns(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<Record<string, GenRun[]>> {
  if (!itemIds.length) return {};

  const { data } = await supabase
    .from(RUNS_TABLE)
    .select(RUN_COLUMNS)
    .in('item_id', itemIds)
    .order('created_at');

  const byItem: Record<string, GenRun[]> = {};
  for (const row of (data ?? []) as RunRow[]) {
    const key = row.item_id;
    if (!key) continue;
    (byItem[key] ??= []).push(toRun(row));
  }

  return byItem;
}
