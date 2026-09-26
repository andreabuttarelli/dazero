/**
 * QUALI MODELLI QUESTO NODO PUÒ OFFRIRE, ADESSO — un modello alla volta, dai due fatti che
 * servono ENTRAMBI, mai uno solo:
 *
 *   COSA IL MODELLO ACCETTA — sincronizzato da OpenRouter (`ai_models`, `ai-models-sync.ts`). Tre
 *   listini diversi per medium: `chat` per il testo, `image` per `/images/models`, `video` per
 *   `/videos/models` — lo stesso id può comparire su più di uno con fatti diversi, ed è per questo
 *   che la riga si cerca sul CATALOGO giusto, non per id da solo.
 *
 *   COME LO SI CHIAMA — i nostri fatti di integrazione (`image-models.ts`, `video-models.ts`):
 *   quale campo del corpo vuole i riferimenti, quanti ne inoltra, quanto può durare una clip,
 *   il prezzo che fatturiamo. OpenRouter non pubblica NESSUNO di questi — verificato leggendo le
 *   risposte vere di `/images/models` e `/videos/models`: `input_references` è un tetto numerico,
 *   non il nome del campo; nessun payload nomina `image_urls` o `input_urls`. Restano nostri.
 *
 * LA REGOLA DEL PRODOTTO: OGNI riga sincronizzata è offerta — "l'app comanda" (CLAUDE.md) vuol
 * dire seguire OpenRouter, non un elenco scritto a mano che lo filtra silenziosamente a una
 * manciata di famiglie. Uno spec nostro (`image-models.ts`, `video-models.ts`) ARRICCHISCE la
 * riga quando esiste — il campo dei riferimenti, i rapporti misurati, il prezzo — non la gate: un
 * modello sincronizzato SENZA spec passa con la resa più prudente (`GENERIC_IMAGE_ASPECTS`, nessun
 * `unitCredits` finché non lo misuriamo) invece di sparire dal menu. Un nostro spec senza una riga
 * sincronizzata — l'avevamo integrato, il sync di oggi non lo conferma più — resta fuori, con la
 * stessa disciplina di `upstream.ts::modalitiesFor`: un `null` dal sync non è "non lo so", è "non
 * offribile", perché altrimenti un provider lo rifiuterebbe dopo aver speso il giro invece che
 * prima.
 *
 * `synced: false` DICE PERCHÉ IL MENU È VUOTO. Una tabella `ai_models` vuota — primo avvio, DB di
 * branch, sync mai girato — produce zero scelte per ogni medium: è la conseguenza accettata della
 * regola sopra, ma un dropdown vuoto senza spiegazione sembra un difetto. Chi chiama (il catalogo
 * della tela, le settings) mostra "catalogo modelli non ancora sincronizzato" quando `synced` è
 * `false`, "nessun modello disponibile" quando è `true` ma `choices` è comunque vuoto — due stati
 * diversi, con due messaggi diversi, perché la causa è diversa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_MODEL_CHOICES, imageModelSpec, IMAGE_REFS_BUDGET, type ImageModelSpec } from '$lib/image-models';
import { videoModelSpec, type VideoModelSpec } from '$lib/video-models';
import type { GenMedium, ModelChoice } from '$lib/canvas/gen-node';
import type { MediaModelSlot } from '$lib/media-model-slots';
import { wireModelId } from '$lib/server/ai-models-sync';
import { providerOf } from '$lib/canvas/model-provider';
import { IMAGE_CREDITS, videoCredits } from '$lib/server/content-cost';
import { videoDurationOptions, VIDEO_RESOLUTIONS, MIN_DURATION } from '$lib/server/video';
import { modelParamsOf } from '$lib/canvas/model-params';

const VIDEO_SPEC_IDS = [
  'bytedance/seedance-2-5',
  'bytedance/seedance-2',
  'bytedance/seedance-2-fast',
  'bytedance/seedance-2-mini',
  'grok-imagine-video-1-5-preview',
  'grok-imagine/image-to-video',
  'kling-3.0/video',
  'black-forest-labs/flux-video-upscale'
];

type SyncedCatalogue = 'image' | 'video';

type SyncedRow = {
  id: string;
  label: string | null;
  input_modalities: string[] | null;
  supported_parameters: string[] | null;
  supported_resolutions: string[] | null;
  param_schema: Record<string, unknown> | null;
};

async function syncedRows(
  admin: SupabaseClient,
  catalogue: SyncedCatalogue
): Promise<{ rows: Map<string, SyncedRow>; synced: boolean }> {
  const { data } = await admin
    .from('ai_models')
    .select('id, label, input_modalities, supported_parameters, supported_resolutions, param_schema')
    .eq('catalogue', catalogue);

  const rows = (data ?? []) as SyncedRow[];
  return {
    rows: new Map(rows.map((r) => [r.id, r])),
    synced: rows.length > 0
  };
}

/**
 * LA RESA PIÙ PRUDENTE, per un modello sincronizzato che non ha uno spec nostro a dirci cosa
 * accetta davvero. `1:1` è nell'elenco di OGNI famiglia integrata qui (Nano Banana, Seedream, GPT
 * Image, Qwen — vedi `image-models.ts`): non un valore inventato, il minimo comune che ogni
 * provider immagine visto finora pubblica.
 */
const GENERIC_IMAGE_ASPECTS = ['1:1'];

/**
 * LE RISOLUZIONI CHE QUESTO MODELLO ACCETTA DAVVERO — dalla riga sincronizzata
 * (`ai_models.supported_resolutions`, `/images/models` → `supported_parameters.resolution.values`),
 * mai un gradino condiviso: misurato il 2026-09-25, Seedream 5 Lite dichiara `[2K,4K]` (mai 1K),
 * Seedream 5 Pro `[1K,2K]` (mai 4K), Nano Banana 2 `[512,1K,2K,4K]`. Un modello senza `resolution`
 * fra i suoi parametri (i GPT Image, che usano `quality`) torna vuoto: assente = una sola resa, e
 * la barra non mostra il selettore.
 */
function imageResolutionsFor(supportedResolutions: string[] | null): string[] | undefined {
  return supportedResolutions?.length ? supportedResolutions : undefined;
}

function genericImageChoice(row: SyncedRow): ModelChoice {
  return {
    id: row.id,
    label: row.label ?? row.id,
    aspectRatios: GENERIC_IMAGE_ASPECTS,
    maxRefs: IMAGE_REFS_BUDGET,
    ...providerOf(row.id),
    inputModalities: row.input_modalities ?? [],
    resolutions: imageResolutionsFor(row.supported_resolutions),
    unitCredits: undefined,
    params: modelParamsOf(row.param_schema ?? {})
  };
}

/**
 * LE RISOLUZIONI CHE QUESTO MODELLO ACCETTA DAVVERO — dalla riga sincronizzata
 * (`ai_models.supported_resolutions`, `/videos/models`), mai un elenco condiviso: `happyhorse-1.0`
 * dichiara `["720p", "1080p"]`, mai 480p, e offrirgli 480p è il rifiuto che ha aperto questo file
 * (`video_renders` cb1de6e2). Vuoto (sync non ancora arrivato a quel campo, o riga anteriore alla
 * migration) ripiega su `VIDEO_RESOLUTIONS`, il tetto misurato del nostro trasporto — mai un menu
 * senza selettore, che spedirebbe la resa di default silenziosa.
 */
function videoResolutionsFor(row: SyncedRow): string[] {
  return row.supported_resolutions?.length ? row.supported_resolutions : [...VIDEO_RESOLUTIONS];
}

/**
 * Idem per il video: un solo rapporto (verticale, il formato di ogni social feed che questo
 * prodotto pubblica) e una sola durata — `MIN_DURATION` del prodotto, non il minimo grezzo del
 * provider, che non conosciamo per un modello senza spec.
 */
function genericVideoChoice(row: SyncedRow): ModelChoice {
  return {
    id: row.id,
    label: row.label ?? row.id,
    aspectRatios: ['9:16'],
    minDuration: MIN_DURATION,
    maxDuration: MIN_DURATION,
    durationOptions: [MIN_DURATION],
    resolutions: videoResolutionsFor(row),
    ...providerOf(row.id),
    inputModalities: row.input_modalities ?? [],
    unitCredits: undefined,
    params: modelParamsOf(row.param_schema ?? {})
  };
}

function imageChoice(
  spec: ImageModelSpec,
  wireId: string,
  inputModalities: string[],
  supportedResolutions: string[] | null,
  paramSchema: Record<string, unknown> | null
): ModelChoice {
  return {
    id: spec.id,
    label: spec.label,
    aspectRatios: spec.aspectRatios,
    maxRefs: spec.maxRefs,
    ...providerOf(wireId),
    inputModalities,
    resolutions: imageResolutionsFor(supportedResolutions),
    unitCredits: IMAGE_CREDITS,
    params: modelParamsOf(paramSchema ?? {})
  };
}

function videoChoice(spec: VideoModelSpec, row: SyncedRow, inputModalities: string[]): ModelChoice {
  return {
    id: spec.id,
    label: spec.label,
    aspectRatios: [...spec.ratios],
    minDuration: spec.minDuration,
    maxDuration: spec.maxDuration,
    durationOptions: videoDurationOptions(spec.id),
    maxPromptChars: spec.maxPromptChars,
    generateAudio: spec.generateAudio,
    // Dalla riga sincronizzata: ogni modello dichiara le SUE risoluzioni su `/videos/models`, mai
    // un tetto uguale per tutti — v. `videoResolutionsFor`.
    resolutions: videoResolutionsFor(row),
    ...providerOf(row.id),
    inputModalities,
    unitCredits: videoCredits(spec.id),
    params: modelParamsOf(row.param_schema ?? {})
  };
}

async function offerableImages(admin: SupabaseClient): Promise<OfferableModels> {
  const { rows, synced } = await syncedRows(admin, 'image');

  const specs = IMAGE_MODEL_CHOICES.map((c) => imageModelSpec(c.id)).filter(
    (spec): spec is ImageModelSpec => !!spec
  );
  const wireIds = await Promise.all(specs.map((spec) => wireModelId(spec.id, 'image')));
  const specced = new Set<string>();
  const choices: ModelChoice[] = [];
  specs.forEach((spec, i) => {
    const wireId = wireIds[i];
    if (!wireId || !rows.has(wireId)) return;
    specced.add(wireId);
    choices.push(
      imageChoice(
        spec,
        wireId,
        rows.get(wireId)?.input_modalities ?? [],
        rows.get(wireId)?.supported_resolutions ?? null,
        rows.get(wireId)?.param_schema ?? null
      )
    );
  });

  // OGNI riga sincronizzata che nessuno spec ha già arricchito: offerta con la resa prudente,
  // non nascosta. Questo è il cambio che fa passare il menu da "le famiglie che abbiamo scritto a
  // mano" a "quello che OpenRouter pubblica davvero" (CLAUDE.md — l'app segue il catalogo).
  for (const [id, row] of rows) {
    if (!specced.has(id)) choices.push(genericImageChoice(row));
  }

  return { synced, choices };
}

async function offerableVideos(admin: SupabaseClient): Promise<OfferableModels> {
  const { rows, synced } = await syncedRows(admin, 'video');

  const specs = VIDEO_SPEC_IDS.map((id) => videoModelSpec(id)).filter(
    (spec): spec is VideoModelSpec => !!spec
  );
  const wireIds = await Promise.all(specs.map((spec) => wireModelId(spec.id, 'video')));
  const specced = new Set<string>();
  const choices: ModelChoice[] = [];
  specs.forEach((spec, i) => {
    const wireId = wireIds[i];
    const row = wireId ? rows.get(wireId) : undefined;
    if (!wireId || !row) return;
    specced.add(wireId);
    choices.push(videoChoice(spec, row, row.input_modalities ?? []));
  });

  for (const [id, row] of rows) {
    if (!specced.has(id)) choices.push(genericVideoChoice(row));
  }

  return { synced, choices };
}

export type OfferableModels = { synced: boolean; choices: ModelChoice[] };

/**
 * QUEL CHE QUESTO MEDIUM PUÒ OFFRIRE, ORA. Il testo non passa da questa regola: il centralino
 * (`openrouter-models.ts`) legge già il listino chat intero per il picker della chat, e un modello
 * che parla non ha un secondo spec di integrazione da incrociare — `text` è dominio di
 * `canvas-catalogue.ts`, non di questo file, che serve immagine e video: i due medium dove un
 * nostro spec (`imageField`/`videoField`, `maxRefs`, prezzo) decide se il render riesce o no.
 */
export async function offerableModels(admin: SupabaseClient, medium: Exclude<GenMedium, 'text'>): Promise<OfferableModels> {
  return medium === 'image' ? offerableImages(admin) : offerableVideos(admin);
}

/**
 * LO STESSO CANCELLO, PER I SEI MESTIERI DELLE SETTINGS (`media-model-slots.ts`). Uno slot video
 * non offre "tutto il video sincronizzato": offre il sottoinsieme che sa fare QUEL ruolo — Kling
 * anima e riscrive, Seedance 2.5 no — la stessa distinzione che `slotAccepts` applica alla
 * scrittura, applicata qui alla lettura, perché un menù che offre un modello che il salvataggio
 * poi rifiuta è la stessa quiete rotta che `slotAccepts` esiste per evitare.
 */
export async function offerableSlotChoices(admin: SupabaseClient, slot: MediaModelSlot): Promise<OfferableModels> {
  if (!slot.role) return offerableImages(admin);

  const all = await offerableVideos(admin);
  const choices = all.choices.filter((c) => videoModelSpec(c.id)?.roles.includes(slot.role!));
  return { synced: all.synced, choices };
}
