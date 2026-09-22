/**
 * `ai_models`, RIEMPITA DAL GATEWAY — non da un elenco scritto a mano.
 *
 * `openrouter-models.ts` gia` chiede `/models` per il prezzo e il picker della chat, in memoria e
 * per processo. Questo file chiede la STESSA rotta e scrive le modalita` — `input_modalities`,
 * `output_modalities`, `supported_parameters` — in una tabella, perche' il resolver del canvas
 * (`upstream-inputs.ts`) deve poter chiedere «questo modello prende un'immagine?» senza tenere in
 * memoria un elenco che un altro processo non vede mai aggiornato.
 *
 * PERCHE' DUE LETTURE DELLO STESSO `/models` invece di farne leggere una sola all'altra: il
 * fallback di `openrouter-models.ts` (listino irraggiungibile → tiene il vecchio in RAM) e questo
 * (listino irraggiungibile → tiene le righe vecchie in tabella, `synced_at` invariato) sono la
 * stessa idea scritta due volte perche' vivono su due piani diversi — un processo, una tabella —
 * e un giorno converranno quando la chat leggera` anche lei da `ai_models`. Non oggi: quel
 * cambiamento e` un altro giro, e sarebbe una riscrittura mascherata da riuso.
 */
import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';

type RawModel = {
  id?: string;
  name?: string;
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: Record<string, unknown>;
};

export type AiModelRow = {
  id: string;
  provider: string;
  label: string | null;
  input_modalities: string[];
  output_modalities: string[];
  supported_parameters: string[];
  pricing: Record<string, unknown>;
  synced_at: string;
};

function toRow(m: RawModel, syncedAt: string): AiModelRow | null {
  if (!m.id) return null;
  return {
    id: m.id,
    provider: 'openrouter',
    label: m.name?.trim() || m.id,
    input_modalities: m.architecture?.input_modalities ?? [],
    output_modalities: m.architecture?.output_modalities ?? [],
    supported_parameters: m.supported_parameters ?? [],
    pricing: m.pricing ?? {},
    synced_at: syncedAt
  };
}

export type SyncOutcome = { ok: true; synced: number } | { ok: false; reason: string };

/**
 * UN GIRO SOLO: chiede il listino, scrive le righe. Nessun retry qui — il cron che chiama questa
 * funzione riprova al giro successivo, e una tabella con `synced_at` vecchio di un'ora non ha mai
 * fatto danni (`openrouter-models.ts` parte dalla stessa premessa con la sua cache).
 */
export async function syncAiModels(
  admin: SupabaseClient,
  opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {}
): Promise<SyncOutcome> {
  const doFetch = opts.fetchImpl ?? fetch;
  const baseUrl = (opts.baseUrl ?? env.LLM_BASE_URL?.trim() ?? '').replace(/\/$/, '');
  if (!baseUrl) return { ok: false, reason: 'LLM_BASE_URL not configured' };

  let body: { data?: RawModel[] };
  try {
    const res = await doFetch(`${baseUrl}/models`);
    if (!res.ok) return { ok: false, reason: `gateway responded ${res.status}` };
    body = (await res.json()) as { data?: RawModel[] };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'fetch_failed' };
  }

  const syncedAt = new Date().toISOString();
  const rows = (body.data ?? []).map((m) => toRow(m, syncedAt)).filter((r): r is AiModelRow => r !== null);
  if (!rows.length) return { ok: false, reason: 'gateway returned no models' };

  const { error } = await admin.from('ai_models').upsert(rows, { onConflict: 'id' });
  if (error) return { ok: false, reason: error.message };

  return { ok: true, synced: rows.length };
}

export type ModelModalities = {
  input: string[];
  output: string[];
  synced_at: string;
} | null;

/**
 * COSA SA UN MODELLO, DALLA TABELLA. Testo, immagine e video passano TUTTI da OpenRouter in questo
 * repo (`llm.ts`, `media-generate.ts`, `video.ts` — nessun host di un provider diretto), quindi un
 * id che il listino non conosce e' un id che non esiste, non un'eccezione da gestire.
 *
 * `null` HA UN SOLO significato onesto: il sync non e' ancora arrivato a quella riga — la tabella
 * vuota al primo avvio, il cron non ancora girato, un fetch fallito ieri notte. Non e' un giudizio
 * sul modello. Per questo NON diventa un rifiuto: bloccare ogni generazione finche' il primo sync
 * non e' passato brucerebbe il prodotto a ogni deploy nuovo, ogni ambiente locale, ogni branch —
 * un prezzo molto piu' alto del rischio che questo controllo esiste per evitare. Chi chiama tratta
 * `null` come "il controllo delle modalita' non si applica qui": i fatti che GOVERNANO davvero
 * l'invio (`maxRefs`, `videoRefCapacity`, quanti riferimenti un modello prende) restano nel
 * catalogo di integrazione (`image-models.ts`, `video-models.ts`), che non dipende da questo sync
 * e continua a funzionare identico a prima che `ai_models` esistesse.
 */
export async function modalitiesOf(admin: SupabaseClient, modelId: string): Promise<ModelModalities> {
  const { data } = await admin
    .from('ai_models')
    .select('input_modalities, output_modalities, synced_at')
    .eq('id', modelId)
    .maybeSingle();

  if (!data) return null;
  return { input: data.input_modalities ?? [], output: data.output_modalities ?? [], synced_at: data.synced_at };
}
