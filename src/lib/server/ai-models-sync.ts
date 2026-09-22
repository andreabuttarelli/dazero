/**
 * `ai_models`, RIEMPITA DA TRE LISTINI DEL GATEWAY — non da un elenco scritto a mano.
 *
 * OpenRouter non pubblica un catalogo, ne pubblica TRE, su tre rotte diverse:
 *
 *   /models         — i modelli di chat, quelli che `openrouter-models.ts` legge già.
 *   /images/models  — 52 modelli immagine (Seedream, GPT Image 2/2.5, Qwen…). NESSUNO di questi
 *                     compare su `/models`: chiamarli lì risponde 404 dicendo per esteso che sono
 *                     modelli immagine (`openrouter-images-api.ts`).
 *   /videos/models  — i modelli video. Anche questi assenti da `/models` — il motivo per cui un
 *                     sync che leggesse solo `/models` avrebbe SEMPRE zero righe con `video` in
 *                     `output_modalities`, non un caso limite ma una lettura dalla rotta sbagliata.
 *
 * UN ID PUÒ COMPARIRE SU PIÙ LISTINI, con fatti diversi: `google/gemini-3-pro-image` è sia un
 * modello di chat che in più emette immagini, sia una riga del listino immagini con parametri
 * propri di quella rotta (`aspect_ratio`, `input_references`). `catalogue` è la colonna che li
 * tiene distinti — la chiave è `(id, catalogue)`, non `id` da solo.
 *
 * IL VIDEO NON DICHIARA `architecture.{input,output}_modalities`: quella rotta pubblica
 * `supported_frame_images`/`generate_audio` invece. Le modalità di una riga video si RICAVANO da
 * quei campi (`videoModalitiesOf`, sotto) — la stessa traduzione che `video-models.ts` faceva a
 * mano riga per riga, scritta qui una volta sola.
 */
import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AiModelCatalogue = 'chat' | 'image' | 'video';

type RawChatOrImageModel = {
  id?: string;
  name?: string;
  supported_parameters?: unknown;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: Record<string, unknown>;
};

type RawVideoModel = {
  id?: string;
  name?: string;
  supported_frame_images?: unknown;
  generate_audio?: unknown;
  pricing_skus?: Record<string, unknown>;
};

export type AiModelRow = {
  id: string;
  catalogue: AiModelCatalogue;
  provider: string;
  label: string | null;
  input_modalities: string[];
  output_modalities: string[];
  supported_parameters: string[];
  pricing: Record<string, unknown>;
  synced_at: string;
};

function toArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  if (raw && typeof raw === 'object') return Object.keys(raw);
  return [];
}

function chatOrImageRow(m: RawChatOrImageModel, catalogue: 'chat' | 'image', syncedAt: string): AiModelRow | null {
  if (!m.id) return null;
  return {
    id: m.id,
    catalogue,
    provider: 'openrouter',
    label: m.name?.trim() || m.id,
    input_modalities: m.architecture?.input_modalities ?? [],
    output_modalities: m.architecture?.output_modalities ?? [],
    supported_parameters: toArray(m.supported_parameters),
    pricing: m.pricing ?? {},
    synced_at: syncedAt
  };
}

/**
 * Cosa ACCETTA e cosa EMETTE un modello video, dai campi che quella rotta pubblica al posto di
 * `architecture`. Sempre testo in ingresso (il prompt) e video in uscita; un fotogramma dichiarato
 * (`supported_frame_images`) vuol dire che accetta un'immagine, `generate_audio` vuol dire che
 * l'audio è un ingresso multimodale della famiglia (Seedance lo legge in `input_references`).
 */
function videoModalitiesOf(m: RawVideoModel): { input: string[]; output: string[] } {
  const frames = toArray(m.supported_frame_images);
  const input = ['text'];
  if (frames.length) input.push('image');
  if (m.generate_audio === true) input.push('audio');
  return { input, output: ['video'] };
}

function videoRow(m: RawVideoModel, syncedAt: string): AiModelRow | null {
  if (!m.id) return null;
  const { input, output } = videoModalitiesOf(m);
  return {
    id: m.id,
    catalogue: 'video',
    provider: 'openrouter',
    label: m.name?.trim() || m.id,
    input_modalities: input,
    output_modalities: output,
    supported_parameters: [],
    pricing: m.pricing_skus ?? {},
    synced_at: syncedAt
  };
}

export type SyncOutcome = { ok: true; synced: number } | { ok: false; reason: string };

type CatalogueFetch<Raw> = {
  path: string;
  toRow: (raw: Raw, syncedAt: string) => AiModelRow | null;
};

const CATALOGUES: [CatalogueFetch<RawChatOrImageModel>, CatalogueFetch<RawChatOrImageModel>, CatalogueFetch<RawVideoModel>] = [
  { path: '/models', toRow: (m, at) => chatOrImageRow(m, 'chat', at) },
  { path: '/images/models', toRow: (m, at) => chatOrImageRow(m, 'image', at) },
  { path: '/videos/models', toRow: videoRow }
];

async function fetchCatalogue<Raw>(
  doFetch: typeof fetch,
  baseUrl: string,
  entry: CatalogueFetch<Raw>,
  syncedAt: string
): Promise<{ rows: AiModelRow[]; ok: boolean; reason?: string }> {
  try {
    const res = await doFetch(`${baseUrl}${entry.path}`);
    if (!res.ok) return { rows: [], ok: false, reason: `${entry.path} responded ${res.status}` };
    const body = (await res.json()) as { data?: Raw[] };
    const rows = (body.data ?? []).map((m) => entry.toRow(m, syncedAt)).filter((r): r is AiModelRow => r !== null);
    return { rows, ok: true };
  } catch (e) {
    return { rows: [], ok: false, reason: e instanceof Error ? e.message : `${entry.path} fetch_failed` };
  }
}

/**
 * UN GIRO SOLO, TRE RICHIESTE: chiede i tre listini, scrive le righe di quelli che hanno risposto.
 * Un listino giù non blocca gli altri due — la stessa disciplina di `openrouter-video-models.ts`,
 * dove una rete che cade lascia le cose come stavano invece di fermare tutto. Fallisce solo se
 * NESSUNO dei tre ha risposto: a quel punto non c'è niente da scrivere, e la ragione è quella
 * dell'ultimo fallimento incontrato.
 */
export async function syncAiModels(
  admin: SupabaseClient,
  opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {}
): Promise<SyncOutcome> {
  const doFetch = opts.fetchImpl ?? fetch;
  const baseUrl = (opts.baseUrl ?? env.LLM_BASE_URL?.trim() ?? '').replace(/\/$/, '');
  if (!baseUrl) return { ok: false, reason: 'LLM_BASE_URL not configured' };

  const syncedAt = new Date().toISOString();
  const results = await Promise.all(CATALOGUES.map((c) => fetchCatalogue(doFetch, baseUrl, c, syncedAt)));

  const rows = results.flatMap((r) => r.rows);
  if (!rows.length) {
    const reason = results.find((r) => !r.ok)?.reason ?? 'gateway returned no models';
    return { ok: false, reason };
  }

  const { error } = await admin.from('ai_models').upsert(rows, { onConflict: 'id,catalogue' });
  if (error) return { ok: false, reason: error.message };

  return { ok: true, synced: rows.length };
}

export type ModelModalities = {
  input: string[];
  output: string[];
  synced_at: string;
} | null;

/**
 * COSA SA UN MODELLO, DALLA TABELLA, PER UN LISTINO PRECISO. Lo stesso id può comparire su più
 * listini con fatti diversi (`google/gemini-3-pro-image` come modello di chat e come modello
 * immagine): chiedere senza dire quale listino risponderebbe con una riga a caso fra le due.
 *
 * `null` HA UN SOLO significato onesto: il sync non e' ancora arrivato a quella riga di QUEL
 * listino. Non e' un giudizio sul modello — chi chiama tratta `null` come "il controllo delle
 * modalita' non si applica qui": i fatti che GOVERNANO davvero l'invio (`maxRefs`,
 * `videoRefCapacity`, quale campo vuole i riferimenti) restano nel catalogo di integrazione
 * (`image-models.ts`, `video-models.ts`), che non dipende da questo sync.
 */
/**
 * `catalogue` OMESSO cerca su tutti e tre, e torna il primo che risponde — è il ripiego per un
 * chiamante che non sa ancora, al punto in cui chiede, quale mestiere fa il nodo (`upstream.ts`
 * oggi passa solo l'id del modello, non il medium del nodo). Un chiamante che SA quale listino
 * interrogare — il picker, che il medium ce l'ha in mano — lo passa sempre, perché un id in comune
 * fra due listini (`google/gemini-3-pro-image` come chat e come immagine) senza catalogo risponde
 * al PRIMO che trova, non a quello giusto.
 */
export async function modalitiesOf(
  admin: SupabaseClient,
  modelId: string,
  catalogue?: AiModelCatalogue
): Promise<ModelModalities> {
  const catalogues: AiModelCatalogue[] = catalogue ? [catalogue] : ['chat', 'image', 'video'];

  for (const c of catalogues) {
    const { data } = await admin
      .from('ai_models')
      .select('input_modalities, output_modalities, synced_at')
      .eq('id', modelId)
      .eq('catalogue', c)
      .maybeSingle();

    if (data) {
      return { input: data.input_modalities ?? [], output: data.output_modalities ?? [], synced_at: data.synced_at };
    }
  }

  return null;
}
