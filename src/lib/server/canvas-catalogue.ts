/**
 * I MODELLI CHE UN NODO DELLA TELA PUÒ SCEGLIERE.
 *
 * Due fonti, e non è disordine: sono due cose diverse.
 *
 *   IL TESTO viene dal centralino (`openrouter-models`), l'INTERO listino chat del gateway: un
 *   nodo che scrive testo non ha bisogno di saper chiamare tool o leggere immagini, e un modello
 *   nuovo pubblicato dal gateway compare da sé senza che nessuno tocchi questo repo.
 *
 *   IMMAGINE E VIDEO vengono da `offerableModels` (`$lib/server/offerable-models`): un modello è
 *   offerto solo quando ha SIA una riga sincronizzata in `ai_models` (cosa accetta, da OpenRouter)
 *   SIA un nostro spec di integrazione (come lo si chiama — `image-models.ts`/`video-models.ts`).
 *   Quei limiti viaggiano CON la scelta: senza, chi vuole venti secondi in 9:16 lo scopre dal
 * rifiuto, dopo aver pagato il giro.
 *
 * `synced` DICE PERCHÉ IL MENU DI UN MEDIUM È VUOTO: `ai_models` senza righe per quel listino —
 * primo avvio, DB di branch, sync mai girato — produce zero scelte, e senza questo flag un
 * dropdown vuoto sembra un difetto invece che la conseguenza accettata della regola "non
 * sincronizzato, non offerto". Il testo non ha un equivalente: il centralino tiene sempre almeno
 * la sua cache o torna vuoto senza che la regola del prodotto sia in gioco.
 */
import { gatewayModels, ensureGatewayModels } from './openrouter-models';
import { offerableModels } from './offerable-models';
import type { GenMedium, ModelChoice } from '$lib/canvas/gen-node';
import { createAdminClient } from './supabase-admin';

export type MediumCatalogue = { choices: ModelChoice[]; synced: boolean };

/**
 * Il catalogo completo, un medium alla volta.
 *
 * `ensureGatewayModels` non è atteso a vuoto: il centralino tiene una cache di processo, e senza
 * questa chiamata il primo caricamento della tela troverebbe la lista vuota — cioè un menù che si
 * riempie solo alla seconda visita, che è il difetto peggiore da diagnosticare.
 */
export async function canvasModelCatalogue(): Promise<Record<GenMedium, MediumCatalogue>> {
  await ensureGatewayModels().catch(() => {});
  const admin = createAdminClient();

  const [image, video] = await Promise.all([
    offerableModels(admin, 'image'),
    offerableModels(admin, 'video')
  ]);

  return {
    text: { choices: gatewayModels().map((m) => ({ id: m.id, label: m.label, aspectRatios: [] })), synced: true },
    image,
    video
  };
}
