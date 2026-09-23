/**
 * QUANTO COSTA UN LOOP, PRIMA DI GIRARLO — CLAUDE.md lo chiede esplicito: "il nodo mostra quante
 * generazioni e quanti crediti costerà" prima del clic, e i crediti si controllano PER TUTTO IL
 * LOOP in anticipo, non scoperti vuoti a metà strada.
 *
 * UN SOLO PREZZO PER ITERAZIONE, MOLTIPLICATO — non una somma di prezzi diversi per iterazione:
 * ogni iterazione di un loop gira lo STESSO medium con lo STESSO modello, cambia solo il prompt
 * che gli input `iterate` costruiscono. Il prezzo unitario viene dallo stesso listino che
 * `content-cost.ts` usa per un post — `IMAGE_CREDITS`, `videoCredits(model)`, `TEXT_NODE_CREDITS`
 * — MAI un numero riscritto qui: due listini per lo stesso modello divergono al primo prezzo
 * cambiato, esattamente l'errore che quel file esiste per evitare.
 */
import { IMAGE_CREDITS, TEXT_NODE_CREDITS, videoCredits } from '$lib/server/content-cost';
import type { GenMedium } from '$lib/canvas/gen-node';

export type LoopCostInput = { medium: GenMedium; model: string | null; count: number };

export type LoopCostEstimate = { perRun: number; total: number };

function perRunCredits(medium: GenMedium, model: string | null): number {
  if (medium === 'image') return IMAGE_CREDITS;
  if (medium === 'video') return videoCredits(model ?? undefined);
  return TEXT_NODE_CREDITS;
}

export function estimateLoopCredits(input: LoopCostInput): LoopCostEstimate {
  const perRun = perRunCredits(input.medium, input.model);
  const count = Math.max(0, Math.round(input.count));
  return { perRun, total: perRun * count };
}
