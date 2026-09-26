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
  seed?: unknown;
  supported_resolutions?: unknown;
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
  /** I token di `resolution` che QUESTO modello accetta — su `/videos/models`,
   *  `supported_resolutions` (minuscoli: `480p`, `720p`…); su `/images/models`,
   *  `supported_parameters.resolution.values` (`1K`, `2K`, `4K`, e su Nano Banana 2 anche `512`).
   *  DIVERSO PER MODELLO: Seedream 5 Lite dichiara `[2K,4K]`, Seedream 5 Pro `[1K,2K]` — nessun
   *  gradino condiviso, misurato il 2026-09-25 contro `/images/models` (52 righe, vedi
   *  `offerable-models.ts`). Vuoto per chat, e per un'immagine che non dichiara `resolution`
   *  affatto (i GPT Image, che usano `quality` invece). */
  supported_resolutions: string[];
  /** Lo schema DICHIARATO di ogni parametro extra — {paramName: {type, values?, min?, max?}} —
   *  per il renderer generico del toolbar. Su image, `supported_parameters` di /images/models
   *  presa intera (non solo le chiavi, come fa `supported_parameters` sopra). Su video,
   *  `generate_audio`/`seed` quando il modello li dichiara true/false. Vuoto per chat. */
  param_schema: Record<string, unknown>;
  pricing: Record<string, unknown>;
  synced_at: string;
};

function toArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  if (raw && typeof raw === 'object') return Object.keys(raw);
  return [];
}

/**
 * Le risoluzioni di un'immagine, da `supported_parameters.resolution.values` — un oggetto
 * `{type: 'enum', values: [...]}`, non un array semplice come gli altri parametri: `resolution`
 * è l'UNICO campo di `/images/models` il cui elenco di valori il prodotto legge, quindi è l'unico
 * per cui `toArray` (pensato per nomi di parametro, non per i loro valori) non basta.
 */
function imageResolutionValues(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const entry = (raw as Record<string, unknown>).resolution;
  if (!entry || typeof entry !== 'object') return [];
  const values = (entry as { values?: unknown }).values;
  return Array.isArray(values) ? values.map((v) => String(v)).filter(Boolean) : [];
}

function imageParamSchema(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
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
    supported_resolutions: catalogue === 'image' ? imageResolutionValues(m.supported_parameters) : [],
    param_schema: catalogue === 'image' ? imageParamSchema(m.supported_parameters) : {},
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

function videoParamSchema(m: RawVideoModel): Record<string, unknown> {
  const schema: Record<string, unknown> = {};
  if (typeof m.generate_audio === 'boolean') schema.generate_audio = { type: 'boolean' };
  if (typeof m.seed === 'boolean') schema.seed = { type: 'boolean' };
  return schema;
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
    supported_resolutions: toArray(m.supported_resolutions),
    param_schema: videoParamSchema(m),
    pricing: m.pricing_skus ?? {},
    synced_at: syncedAt
  };
}

export type SyncOutcome = { ok: true; synced: number } | { ok: false; reason: string };

/**
 * La migration di `param_schema` (20260925130000) può non essere ancora applicata quando questo
 * sync gira — la regola del progetto è che il codice vivo tollera l'assenza della colonna finché
 * non è applicata. Postgres risponde con `42703` (`column "param_schema" of relation "ai_models"
 * does not exist`, messaggio esatto di PostgREST): un solo retry, senza quella chiave, invece di
 * far fallire l'intero sync per una colonna che non è ancora lì.
 */
function isMissingParamSchemaColumn(message: string): boolean {
  return message.includes('param_schema') && message.includes('does not exist');
}

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
  if (error && isMissingParamSchemaColumn(error.message)) {
    const rowsWithoutParamSchema = rows.map(({ param_schema: _param_schema, ...rest }) => rest);
    const retry = await admin.from('ai_models').upsert(rowsWithoutParamSchema, { onConflict: 'id,catalogue' });
    if (retry.error) return { ok: false, reason: retry.error.message };
    return { ok: true, synced: rows.length };
  }
  if (error) return { ok: false, reason: error.message };

  return { ok: true, synced: rows.length };
}

export type ModelModalities = {
  input: string[];
  output: string[];
  synced_at: string;
} | null;

/**
 * IL NOSTRO ID → L'ID DI OPENROUTER, PER MEDIUM. `ai_models.id` è sempre l'id sul FILO
 * (`openai/gpt-image-2.5-flare`, `bytedance/seedance-2.5`), mai il nostro id interno
 * (`gpt-image-2.5-flare`, `bytedance/seedance-2-5`, quello che `nodes.data.model` porta e che
 * `image-models.ts`/`video-models.ts` chiamano `id`). Cercare l'interno sul filo non trova mai
 * niente — non perché il modello sia sparito, ma perché la chiave è quella sbagliata.
 *
 * Un solo posto traduce, perché `offerable-models.ts` (cosa il nodo può SCEGLIERE) e questo
 * modulo (cosa un modello scelto SA fare ancora) devono leggere lo stesso filo o si disallineano
 * di nuovo, silenziosamente, com'è già successo qui.
 *
 * `image` guarda `openrouterImages`, `video`/`chat` guardano `openrouterId` — `chat` perché un
 * modello di testo non ha un secondo spec di integrazione: il suo id interno E' già quello sul
 * filo (`openrouter-models.ts` legge `/models` con l'id a nudo).
 *
 * Due assenze, due risposte diverse: NESSUNO spec per quel medium (id sconosciuto in
 * `image-models.ts`/`video-models.ts`) lascia l'id così com'è — il chiamante lo cerca comunque, e
 * se non lo trova è genuinamente sconosciuto, non un problema di traduzione. Uno spec che ESISTE
 * ma dichiara `openrouterImages`/`openrouterId` null — quella famiglia non passa da OpenRouter,
 * per scelta — torna `null`: tradurlo nell'id nudo lo farebbe combaciare per caso con una riga di
 * `ai_models` che non ha niente a che fare con lui.
 */
export async function wireModelId(specId: string, medium: AiModelCatalogue): Promise<string | null> {
  if (medium === 'image') {
    const { imageModelSpec } = await import('$lib/image-models');
    const spec = imageModelSpec(specId);
    return spec ? spec.openrouterImages : specId;
  }
  if (medium === 'video') {
    const { videoModelSpec } = await import('$lib/video-models');
    const spec = videoModelSpec(specId);
    return spec ? (spec.openrouterId ?? null) : specId;
  }
  return specId;
}

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
 * chiamante che non sa ancora, al punto in cui chiede, quale mestiere fa il nodo. Un chiamante che
 * SA quale listino interrogare — il picker, `upstream.ts` col medium del nodo in mano — lo passa
 * sempre, perché un id in comune fra due listini (`google/gemini-3-pro-image` come chat e come
 * immagine) senza catalogo risponde al PRIMO che trova, non a quello giusto. Quando `catalogue` è
 * dato, `modelId` viene tradotto dal nostro id interno all'id sul filo PRIMA della query — vedi
 * `wireModelId`; omesso, `modelId` è usato così com'è, perché senza un medium non c'è uno spec da
 * cui tradurre.
 */
export async function modalitiesOf(
  admin: SupabaseClient,
  modelId: string,
  catalogue?: AiModelCatalogue
): Promise<ModelModalities> {
  const catalogues: AiModelCatalogue[] = catalogue ? [catalogue] : ['chat', 'image', 'video'];

  for (const c of catalogues) {
    const wireId = catalogue ? await wireModelId(modelId, catalogue) : modelId;
    if (wireId === null) continue;

    const { data } = await admin
      .from('ai_models')
      .select('input_modalities, output_modalities, synced_at')
      .eq('id', wireId)
      .eq('catalogue', c)
      .maybeSingle();

    if (data) {
      return { input: data.input_modalities ?? [], output: data.output_modalities ?? [], synced_at: data.synced_at };
    }
  }

  return null;
}

/**
 * LE MODALITÀ IN INGRESSO DI OGNI MODELLO DI CHAT, IN UN GIRO SOLO — un nodo testo nasce con
 * l'intero listino (`canvasModelCatalogue`), e chiedere `modalitiesOf` un modello alla volta
 * sarebbe una query per riga invece di una per l'intero catalogo. L'id di un modello di chat è
 * già quello sul filo (`wireModelId`, sopra): nessuna traduzione qui, la chiave è diretta.
 */
export async function chatInputModalities(admin: SupabaseClient): Promise<Map<string, string[]>> {
  const { data } = await admin.from('ai_models').select('id, input_modalities').eq('catalogue', 'chat');
  const rows = (data ?? []) as { id: string; input_modalities: string[] | null }[];
  return new Map(rows.map((r) => [r.id, r.input_modalities ?? []]));
}
