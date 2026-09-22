/**
 * I MODELLI CHE UN NODO DELLA TELA PUÒ SCEGLIERE.
 *
 * Due registri, e non è disordine: sono due cose diverse.
 *
 *   IL TESTO viene dal centralino (`openrouter-models`), l'INTERO listino del gateway: un nodo
 *   che scrive testo non ha bisogno di saper chiamare tool o leggere immagini, e un modello
 *   nuovo pubblicato dal gateway compare da sé senza che nessuno tocchi questo repo.
 *
 *   IMMAGINE E VIDEO vengono dal registro dei media (`media-model-slots`), che è l'unico posto a
 *   sapere in quali formati un modello disegna, quanto può durare una clip, quanti riferimenti
 *   inoltra e se produce audio. Quei limiti viaggiano CON la scelta: senza, chi vuole venti secondi
 *   in 9:16 lo scopre dal rifiuto, dopo aver pagato il giro.
 *
 * Tenerli in un elenco solo avrebbe voluto dire inventare i campi mancanti su metà delle voci —
 * una foto che dichiara una durata, un modello di testo che dichiara un formato — cioè dire che
 * quei campi esistono e valgono zero. Il nodo chiede il catalogo del SUO medium e basta.
 */
import { gatewayModels, ensureGatewayModels } from './openrouter-models';
import { MEDIA_MODEL_SLOTS, slotChoices } from '$lib/media-model-slots';
import type { GenMedium, ModelChoice } from '$lib/canvas/gen-node';

/** Quale mestiere del registro dei media serve un nodo, per medium. */
const SLOT_FOR: Record<Exclude<GenMedium, 'text'>, string> = {
  image: 'imageModel',
  video: 'videoModel'
};

function mediaChoices(slotId: string): ModelChoice[] {
  const slot = MEDIA_MODEL_SLOTS.find((s) => s.id === slotId);
  if (!slot) return [];

  return slotChoices(slot).map((c) => ({
    id: c.id,
    label: c.label,
    aspectRatios: c.aspectRatios ?? [],
    maxRefs: c.maxRefs,
    minDuration: c.minDuration,
    maxDuration: c.maxDuration,
    maxPromptChars: c.maxPromptChars,
    generateAudio: c.generateAudio
  }));
}

/**
 * Il catalogo completo, un medium alla volta.
 *
 * `ensureGatewayModels` non è atteso a vuoto: il centralino tiene una cache di processo, e senza
 * questa chiamata il primo caricamento della tela troverebbe la lista vuota — cioè un menù che si
 * riempie solo alla seconda visita, che è il difetto peggiore da diagnosticare.
 */
export async function canvasModelCatalogue(): Promise<Record<GenMedium, ModelChoice[]>> {
  await ensureGatewayModels().catch(() => {});

  return {
    text: gatewayModels().map((m) => ({ id: m.id, label: m.label, aspectRatios: [] })),
    image: mediaChoices(SLOT_FOR.image),
    video: mediaChoices(SLOT_FOR.video)
  };
}
