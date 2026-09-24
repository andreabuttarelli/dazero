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
  /** Chi ha fatto questo modello (`model-provider.ts::providerOf`), dall'id sul filo — mai
   *  ricalcolato lato client dall'id interno, che per immagine e video non ha il prefisso. */
  provider: string;
  providerLabel: string;
  maxRefs?: number;
  minDuration?: number;
  maxDuration?: number;
  maxPromptChars?: number;
  generateAudio?: boolean;
  /** `ai_models.input_modalities` sincronizzate per questo modello — quel che `connectorsFor`
   *  (`canvas/connectors.ts`) traduce nelle porte del nodo. Assente per il testo, che non passa
   *  da `offerable-models.ts` e non ha porte oltre a quella fissa. */
  inputModalities?: string[];
};

/** Quel che l'utente ha scelto nell'overlay. Non è il catalogo: è la scelta dentro al catalogo. */
export type GenParams = {
  aspectRatio?: string;
  duration?: number;
  audio?: boolean;
  /** Quante varianti semplici in loop, quando il nodo non ha archi `iterate` (`loop-plan.ts`,
   *  CLAUDE.md — "repeat N"). Con degli assi collegati non conta: le combinazioni le dettano i
   *  valori, non questo numero. */
  repeat?: number;
  /** Cartesiano (default, assente) o accoppiato indice-per-indice — `loop-plan.ts::LoopCombine`. */
  combine?: 'product' | 'zip';
};

/**
 * Un giro già avvenuto: un fatto congelato, non quel che il nodo dice adesso. Il prompt e il
 * modello si COPIANO qui apposta — quelli sul nodo sono i prossimi, e cambiano dieci volte mentre
 * si guarda il risultato del giro precedente. Rimandare a loro racconterebbe che l'immagine di
 * ieri è nata dalla frase di stamattina.
 */
export type GenRun = {
  id: string;
  /** L'asset prodotto. Null quando la libreria l'ha perso per strada, o quando il giro è in volo. */
  mediaId: string | null;
  prompt: string;
  model: string | null;
  createdAt: string;
  /** Il testo generato, quando il giro ha prodotto testo: l'immagine non ha nulla da mettere qui. */
  text?: string | null;
};

export type GenNode = {
  id: string;
  medium: GenMedium;
  model: string | null;
  prompt: string;
  params: GenParams;
  /**
   * L'asset CHE SI VEDE ADESSO. Null finché il nodo non ha girato: è lo stato normale, non una
   * riga rotta. Non è «l'ultimo prodotto» — tornare indietro su un giro di prima lo sposta lì, ed
   * è l'unica cosa che sopravvive a una ricarica dicendo dove si era fermato lo sguardo.
   */
  refId: string | null;
  /**
   * Tutti i giri che questo nodo ha fatto, dal più vecchio. Senza, rigenerare sovrascriveva e la
   * generazione di prima era irrecuperabile DAL NODO: il file restava in libreria, il legame no.
   */
  runs: GenRun[];
  running?: boolean;
  /** Perché l'ultimo giro non è atterrato. Null quando non c'è nulla da dire. */
  error?: string | null;
};

/**
 * `running` VINCE SU TUTTO, anche su un nodo che ha già prodotto: chi sta rifacendo un'immagine
 * deve vedere che sta girando, non il risultato di prima con un bottone che invita a rilanciare.
 */
export type RunState = 'empty' | 'ready' | 'running' | 'done' | 'failed';

export type UpstreamTextAvailability = { hasUpstreamText: boolean };

/**
 * SE QUESTO NODO HA UN PROMPT DA CUI GIRARE: il proprio, o — in sua assenza — un testo a monte
 * collegato. UN SOLO POSTO decide questa regola: `runStateOf` (sotto) e `blockedReason`
 * (`gen-history.ts`) la chiamano entrambi, invece di ripetere `node.prompt.trim()` ciascuno con
 * la propria dimenticanza di guardare a monte — il difetto segnalato («B non conta il testo di
 * A collegato») era esattamente due copie della stessa domanda, una delle due sbagliata.
 */
export function hasPrompt(node: GenNode, upstream: UpstreamTextAvailability = { hasUpstreamText: false }): boolean {
  return Boolean(node.prompt.trim()) || upstream.hasUpstreamText;
}

export function runStateOf(node: GenNode, upstream: UpstreamTextAvailability = { hasUpstreamText: false }): RunState {
  if (node.running) return 'running';
  if (node.error) return 'failed';
  if (node.refId) return 'done';
  return hasPrompt(node, upstream) ? 'ready' : 'empty';
}

/**
 * IL NODO COME LO SI VEDE SUBITO DOPO IL CLIC, prima ancora che il server sappia del giro:
 * `unlockRun` è il rollback simmetrico, chiamato quando il server rifiuta.
 */
export function startRun(node: GenNode): GenNode {
  return { ...node, running: true, error: null };
}

/**
 * Sblocca un nodo rimasto in corsa. Il video parte e torna dopo: se la risposta non arriva più,
 * `running` resterebbe alzato per sempre e il bottone spento — l'utente deve poter riprendere.
 * L'errore si toglie insieme: o si riparte, o si torna a prima del giro.
 */
export function unlockRun(node: GenNode): GenNode {
  return { ...node, running: false, error: null };
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
