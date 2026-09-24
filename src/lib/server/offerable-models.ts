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
 * LA REGOLA DEL PRODOTTO: un modello è offerto SOLO quando ha ENTRAMBI. Sincronizzato senza un
 * nostro spec — OpenRouter lo sa fare, ma noi non sappiamo chiamarlo — resta fuori. Un nostro
 * spec senza una riga sincronizzata — l'avevamo integrato, il sync di oggi non lo conferma più —
 * resta fuori anche lui, con la stessa disciplina di `upstream.ts::modalitiesFor`: un `null` dal
 * sync non è "non lo so", è "non offribile", perché altrimenti un provider lo rifiuterebbe dopo
 * aver speso il giro invece che prima.
 *
 * `synced: false` DICE PERCHÉ IL MENU È VUOTO. Una tabella `ai_models` vuota — primo avvio, DB di
 * branch, sync mai girato — produce zero scelte per ogni medium: è la conseguenza accettata della
 * regola sopra, ma un dropdown vuoto senza spiegazione sembra un difetto. Chi chiama (il catalogo
 * della tela, le settings) mostra "catalogo modelli non ancora sincronizzato" quando `synced` è
 * `false`, "nessun modello disponibile" quando è `true` ma `choices` è comunque vuoto — due stati
 * diversi, con due messaggi diversi, perché la causa è diversa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_MODEL_CHOICES, imageModelSpec, type ImageModelSpec } from '$lib/image-models';
import { videoModelSpec, type VideoModelSpec } from '$lib/video-models';
import type { GenMedium, ModelChoice } from '$lib/canvas/gen-node';
import type { MediaModelSlot } from '$lib/media-model-slots';
import { wireModelId } from '$lib/server/ai-models-sync';
import { providerOf } from '$lib/canvas/model-provider';

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

async function syncedRows(
  admin: SupabaseClient,
  catalogue: SyncedCatalogue
): Promise<{ inputModalities: Map<string, string[]>; synced: boolean }> {
  const { data } = await admin
    .from('ai_models')
    .select('id, input_modalities')
    .eq('catalogue', catalogue);

  const rows = (data ?? []) as { id: string; input_modalities: string[] | null }[];
  return {
    inputModalities: new Map(rows.map((r) => [r.id, r.input_modalities ?? []])),
    synced: rows.length > 0
  };
}

function imageChoice(spec: ImageModelSpec, wireId: string, inputModalities: string[]): ModelChoice {
  return {
    id: spec.id,
    label: spec.label,
    aspectRatios: spec.aspectRatios,
    maxRefs: spec.maxRefs,
    ...providerOf(wireId),
    inputModalities
  };
}

function videoChoice(spec: VideoModelSpec, wireId: string, inputModalities: string[]): ModelChoice {
  return {
    id: spec.id,
    label: spec.label,
    aspectRatios: [...spec.ratios],
    minDuration: spec.minDuration,
    maxDuration: spec.maxDuration,
    maxPromptChars: spec.maxPromptChars,
    generateAudio: spec.generateAudio,
    ...providerOf(wireId),
    inputModalities
  };
}

async function offerableImages(admin: SupabaseClient): Promise<OfferableModels> {
  const { inputModalities, synced } = await syncedRows(admin, 'image');

  const specs = IMAGE_MODEL_CHOICES.map((c) => imageModelSpec(c.id)).filter(
    (spec): spec is ImageModelSpec => !!spec
  );
  const wireIds = await Promise.all(specs.map((spec) => wireModelId(spec.id, 'image')));
  const choices: ModelChoice[] = [];
  specs.forEach((spec, i) => {
    const wireId = wireIds[i];
    if (!wireId || !inputModalities.has(wireId)) return;
    choices.push(imageChoice(spec, wireId, inputModalities.get(wireId) ?? []));
  });

  return { synced, choices };
}

async function offerableVideos(admin: SupabaseClient): Promise<OfferableModels> {
  const { inputModalities, synced } = await syncedRows(admin, 'video');

  const specs = VIDEO_SPEC_IDS.map((id) => videoModelSpec(id)).filter(
    (spec): spec is VideoModelSpec => !!spec
  );
  const wireIds = await Promise.all(specs.map((spec) => wireModelId(spec.id, 'video')));
  const choices: ModelChoice[] = [];
  specs.forEach((spec, i) => {
    const wireId = wireIds[i];
    if (!wireId || !inputModalities.has(wireId)) return;
    choices.push(videoChoice(spec, wireId, inputModalities.get(wireId) ?? []));
  });

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
