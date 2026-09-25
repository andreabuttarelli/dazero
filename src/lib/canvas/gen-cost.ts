/**
 * QUANTO COSTA UN GIRO SOLO, PURA LOGICA CLIENT-SIDE — la stessa domanda che i bottoni "Genera" e
 * "Loop" fanno prima del clic. Il prezzo per modello è calcolato una volta sola sul server
 * (`content-cost.ts`, `billedCreditsFor`) e viaggia già dentro `ModelChoice.unitCredits`: questo
 * file non ricalcola una tariffa, la LEGGE — due listini per lo stesso modello divergerebbero al
 * primo prezzo cambiato, lo stesso errore che `loop-cost.ts` evita già lato server.
 *
 * UN VIDEO PIÙ LUNGO COSTA DI PIÙ — `unitCredits` è il prezzo misurato alla durata MINIMA che il
 * modello dichiara (`choice.minDuration`): la stessa durata a cui `defaultParamsFor` fa nascere il
 * nodo. Un secondo in più scala linearmente, mai in silenzio: senza `minDuration` non c'è una base
 * da cui scalare, e il prezzo resta quello misurato invece di inventare un rapporto.
 *
 * PREZZO IGNOTO → NIENTE NUMERO, MAI UNO SBAGLIATO. `unitCredits` assente (un modello offerto ma
 * non ancora prezzato) fa tornare `null`: chi disegna il bottone lo controlla e non scrive "~0 cr".
 */
import type { GenMedium, GenParams, ModelChoice } from './gen-node';

export type RunCostInput = { medium: GenMedium; model: ModelChoice | null; params: GenParams };

/**
 * 720p costa ESATTAMENTE il doppio di 480p (misurato, v. `video.ts`). `unitCredits` è prezzato a
 * 480p — la risoluzione a cui nasce un nodo — quindi 480p resta 1× e 720p scala da qui.
 *
 * OGNI ALTRO TOKEN (1080p, 4K, 360p, 768p, 1K…) NON HA UN MOLTIPLICATORE MISURATO: la riga
 * sincronizzata (`ai_models.pricing`) non porta ancora un prezzo per risoluzione che
 * `ModelChoice` esponga, e inventare un rapporto — anche "il doppio ancora" — sarebbe lo stesso
 * numero sbagliato che ha aperto questo file, solo spostato di un gradino. Un token assente da
 * questa tabella fa tornare `null` da `creditsForRun`, mai un 1× silenzioso.
 */
const RESOLUTION_MULTIPLIERS: Record<string, number> = {
  '480p': 1,
  '720p': 2
};

/**
 * I crediti per UN giro di questo medium/modello/parametri, o `null` quando il prezzo non si sa —
 * compreso il caso in cui SI SA il prezzo base ma non il moltiplicatore della risoluzione scelta.
 */
export function creditsForRun(input: RunCostInput): number | null {
  const unit = input.model?.unitCredits;
  if (typeof unit !== 'number') return null;

  if (input.medium !== 'video') return unit;

  const resolution = input.params.resolution;
  const resolutionMultiplier = resolution ? RESOLUTION_MULTIPLIERS[resolution] : 1;
  if (resolutionMultiplier === undefined) return null;

  const base = input.model?.minDuration;
  const duration = input.params.duration;
  if (typeof base !== 'number' || base <= 0 || typeof duration !== 'number' || duration <= 0) {
    return Math.round(unit * resolutionMultiplier);
  }

  return Math.round(unit * (duration / base) * resolutionMultiplier);
}

/** Il totale di un loop di `count` giri identici — `null` appena il prezzo di uno solo lo è. */
export function creditsForLoop(input: RunCostInput, count: number): number | null {
  const perRun = creditsForRun(input);
  if (perRun === null) return null;
  return perRun * Math.max(0, Math.round(count));
}
