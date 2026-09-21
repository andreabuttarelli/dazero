/**
 * IL NODO CHE PRODUCE: cosa sa di sé prima di girare.
 *
 * Qui non si genera niente e non si chiama nessun endpoint — la stessa separazione di `graph.ts`,
 * che dice quali archi sarebbero leciti senza tirarne nessuno. Questo file risponde a tre domande
 * che si fanno mentre il puntatore è ancora in aria: che stato ha il nodo, con che parametri
 * nasce, e se quel prompt il modello lo rifiuterebbe.
 *
 * I LIMITI VENGONO DAL CATALOGO, mai da qui. Formati, durate e tetto del prompt sono fatti del
 * MODELLO e vivono accanto a lui (`media-model-slots`, e `get_media_models` li porta fuori);
 * riscriverne uno qui darebbe due verità e un rifiuto scoperto dopo aver pagato. Per questo
 * `defaultParamsFor` non ha nessun valore di riserva: se un modello non dichiara i formati, il
 * nodo nasce senza formato — il vuoto è onesto, un «1:1» inventato no.
 */
import { MEDIUMS, type Medium } from './graph';

/** I tre medium che un nodo può produrre: gli stessi della tela, non un secondo elenco. */
export const GEN_MEDIUMS = MEDIUMS;

export type GenMedium = Medium;

export function isGenMedium(x: string): x is GenMedium {
  return (GEN_MEDIUMS as readonly string[]).includes(x);
}

/** Quel che il catalogo dice di un modello — il sottoinsieme che il nodo usa per decidere. */
export type ModelChoice = {
  id: string;
  label: string;
  aspectRatios: string[];
  maxRefs?: number;
  minDuration?: number;
  maxDuration?: number;
  maxPromptChars?: number;
  generateAudio?: boolean;
};

/** Quel che l'utente ha scelto nell'overlay. Non è il catalogo: è la scelta dentro al catalogo. */
export type GenParams = {
  aspectRatio?: string;
  duration?: number;
  audio?: boolean;
};

export type GenNode = {
  id: string;
  medium: GenMedium;
  model: string | null;
  prompt: string;
  params: GenParams;
  /** L'asset prodotto. Null finché il nodo non ha girato: è lo stato normale, non una riga rotta. */
  refId: string | null;
  running?: boolean;
};

/**
 * `running` VINCE SU TUTTO, anche su un nodo che ha già prodotto: chi sta rifacendo un'immagine
 * deve vedere che sta girando, non il risultato di prima con un bottone che invita a rilanciare.
 */
export type RunState = 'empty' | 'ready' | 'running' | 'done';

export function runStateOf(node: GenNode): RunState {
  if (node.running) return 'running';
  if (node.refId) return 'done';
  return node.prompt.trim() ? 'ready' : 'empty';
}

/**
 * Con che parametri nasce un nodo su questo modello. Il primo formato dichiarato e la durata
 * minima: il più economico dei validi, che è anche quello che si cambia senza sorprese.
 */
export function defaultParamsFor(choice: ModelChoice): GenParams {
  const params: GenParams = {};

  const [first] = choice.aspectRatios;
  if (first) params.aspectRatio = first;

  if (typeof choice.minDuration === 'number') params.duration = choice.minDuration;
  if (typeof choice.generateAudio === 'boolean') params.audio = choice.generateAudio;

  return params;
}

/** Il provider rifiuterebbe questo prompt? Si chiede prima di spendere il giro. */
export function promptTooLong(prompt: string, choice: ModelChoice): boolean {
  const ceiling = choice.maxPromptChars;
  if (typeof ceiling !== 'number') return false;
  return prompt.length > ceiling;
}

/**
 * Quanto è grande un nodo appena nato. Il testo è una casella di scrittura e resta basso; immagine
 * e video devono poter mostrare quel che hanno prodotto, o il risultato nasce già tagliato.
 */
const GEN_NODE_SIZES: Record<GenMedium, { w: number; h: number }> = {
  text: { w: 360, h: 220 },
  image: { w: 360, h: 460 },
  video: { w: 360, h: 460 }
};

export function genNodeSize(medium: GenMedium): { w: number; h: number } {
  return GEN_NODE_SIZES[medium];
}
