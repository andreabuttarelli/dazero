import { effectiveModel } from './default-models';
/**
 * I CONNETTORI DI UN NODO: derivati dal modello scelto, non elencati a mano per tipo.
 *
 * La regola vecchia era una tabella `accepts: Medium[]` per KIND di nodo (`graph.ts`,
 * `CANVAS_NODE_SPECS`) — un'immagine accetta testo, un video accetta testo e immagine, e ogni
 * modello nuovo che sa fare qualcosa in più (audio, video di riferimento) richiedeva di toccare
 * quella tabella a mano. Qui la domanda si capovolge: «cosa accetta QUESTO modello, secondo
 * OpenRouter» (`ai_models.input_modalities`, sincronizzato — mai scritto a mano), e i connettori
 * sono quella risposta tradotta in porte. Un modello nuovo che OpenRouter pubblica con `audio` fra
 * le modalità mostra il connettore audio SENZA che nessuno tocchi questo file.
 *
 * SEI CONNETTORI, e non un settimo inventato: `text` (il prompt), `images`/`videos`/`audios`
 * (riferimenti multimodali, valore multiplo — più fili sullo stesso connettore), `first_frame` e
 * `last_frame` (i due fotogrammi di un video, valore SINGOLO — un filo solo, il secondo è un
 * conflitto). Un connettore NON è una lista di medium ammessi: È il medium, e un filo è legale
 * quando il medium della sorgente coincide col connettore — una regola, non più una tabella di
 * coppie.
 *
 * I FOTOGRAMMI SONO DUE CONNETTORI COME GLI ALTRI, non un caso speciale incollato sopra: compaiono
 * SOLO su un nodo `video` il cui modello accetta `image` in ingresso — un modello testo-a-video
 * senza immagini non ha un frame da collegare, e mostrarlo sarebbe una porta che il provider
 * rifiuterebbe comunque.
 *
 * NIENTE FALLBACK PER UN MODELLO NON SINCRONIZZATO — non perché il caso sia raro, ma perché NON
 * PUÒ PIÙ ACCADERE: un modello senza riga in `ai_models` non è nel selettore (decisione di
 * prodotto), quindi nessun nodo può trovarsi con "un modello scelto di cui non conosciamo le
 * modalità". `Modalities` non è più nullable qui: se questa funzione viene chiamata, la riga
 * esiste — la premessa che renderebbe un `null` necessario è quella che il selettore ha già
 * escluso, un livello più in alto.
 *
 * PURO: nessun database, nessuna chiamata a un modello. Le modalità arrivano GIÀ RISOLTE
 * (`Modalities`, un tipo minimo che non importa nulla di server) — chi ha un `db`
 * (`upstream.ts`, e la UI attraverso una chiamata che fa la stessa domanda) le chiede una volta e
 * le passa qui, così questo file resta testabile senza nessuno dei due e la UI può disegnare le
 * porte con la STESSA funzione che il resolver usa per collegarle.
 */

export const CONNECTOR_TYPES = ['text', 'images', 'first_frame', 'last_frame', 'videos', 'audios'] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

/** Quanti fili un connettore porta. Il resto è "uno solo": un secondo filo è un conflitto. */
const LIST_VALUED: ReadonlySet<ConnectorType> = new Set(['images', 'videos', 'audios']);

export function isListValued(connector: ConnectorType): boolean {
  return LIST_VALUED.has(connector);
}

/** Una `list` raccoglie: ogni sua porta prende più fili, anche `text`, che altrove è uno solo. */
export function portListValued(nodeType: string, connector: ConnectorType): boolean {
  return nodeType === 'list' || isListValued(connector);
}

/**
 * Come si chiama ogni connettore, per chi guarda — il `title`/`aria-label` di ogni maniglia sulla
 * tile e il messaggio di rifiuto in `upstream-inputs.ts`. Una tabella sola: quel file importava
 * una copia propria, e due elenchi a mano sarebbero divergiti al primo nome cambiato.
 */
export const CONNECTOR_STYLE: Record<ConnectorType, { label: string; color: string }> = {
  text: { label: 'Text', color: '#2563eb' },
  images: { label: 'Images', color: '#16a34a' },
  videos: { label: 'Video', color: '#db2777' },
  audios: { label: 'Audio', color: '#d97706' },
  first_frame: { label: 'First frame', color: '#7c3aed' },
  last_frame: { label: 'Last frame', color: '#0891b2' }
};

export const CONNECTOR_LABEL: Record<ConnectorType, string> = Object.fromEntries(
  CONNECTOR_TYPES.map((c) => [c, CONNECTOR_STYLE[c].label])
) as Record<ConnectorType, string>;

/**
 * UNA MODALITÀ DI OPENROUTER (`ai_models.input_modalities`), IN UN'ICONA DEL MENÙ MODELLO —
 * `type`/`image`/`video`/`audio` prendono il colore della porta che aprirebbero su un nodo
 * (`CONNECTOR_STYLE`, sopra: un'icona verde promette la stessa porta verde), `file` (PDF/
 * documenti) non ne apre una — nessun nodo oggi si collega a un file — e tiene un colore suo,
 * neutro, invece di prenderne uno a caso da un connettore che non aprirà mai.
 */
const MODALITY_BADGE: Partial<Record<string, { icon: string; color: string; label: string }>> = {
  text: { icon: 'type', color: CONNECTOR_STYLE.text.color, label: CONNECTOR_STYLE.text.label },
  image: { icon: 'image', color: CONNECTOR_STYLE.images.color, label: CONNECTOR_STYLE.images.label },
  video: { icon: 'video', color: CONNECTOR_STYLE.videos.color, label: CONNECTOR_STYLE.videos.label },
  audio: { icon: 'audio-lines', color: CONNECTOR_STYLE.audios.color, label: CONNECTOR_STYLE.audios.label },
  file: { icon: 'file-text', color: '#6b7280', label: 'File' }
};

/** L'ordine fisso in cui i distintivi compaiono — mai quello del modello, che varia da riga a riga. */
const MODALITY_ORDER = ['text', 'image', 'video', 'audio', 'file'] as const;

export type ModalityBadge = { modality: string; icon: string; color: string; label: string };

/**
 * I DISTINTIVI DI UN MODELLO PER IL MENÙ — una modalità che OpenRouter non dichiara qui (mai
 * dedotta, mai inventata) non compare: un modello di solo testo mostra un'icona sola.
 */
export function modalityBadges(inputModalities: string[]): ModalityBadge[] {
  const has = new Set(inputModalities);
  return MODALITY_ORDER.filter((m) => has.has(m)).map((m) => ({ modality: m, ...MODALITY_BADGE[m]! }));
}

const NODE_OUTPUT: Partial<Record<string, ConnectorType>> = {
  text: 'text',
  doc: 'text',
  image: 'images',
  influencer: 'images',
  video: 'videos'
};

export function outputConnectorOf(nodeType: string): ConnectorType | null {
  return NODE_OUTPUT[nodeType] ?? null;
}

/** Il minimo che `ai-models-sync.ts::ModelModalities` porta — nessun import di codice server qui. */
export type Modalities = { input: string[] };

const CONNECTOR_MODALITY: Record<Exclude<ConnectorType, 'first_frame' | 'last_frame'>, string> = {
  text: 'text',
  images: 'image',
  videos: 'video',
  audios: 'audio'
};

export type GenerativeNodeKind = 'text' | 'image' | 'video';

/**
 * I CONNETTORI DI QUESTO NODO, ORA — in un ORDINE STABILE (`CONNECTOR_TYPES`), perché la UI li
 * disegna nello stesso ordine a ogni giro e il resolver li itera nello stesso ordine per la
 * conta deterministica.
 */
export function connectorsFor(kind: GenerativeNodeKind, modalities: Modalities): ConnectorType[] {
  const has = new Set(modalities.input);
  const out: ConnectorType[] = [];

  // UN NODO TESTO HA SEMPRE LA PORTA TESTO, anche quando il modello scelto non è ancora noto
  // (`connectorsForNode` chiama con `input: []` finché il catalogo non ha risolto una scelta): il
  // proprio prompt resta scrivibile a prescindere, e ogni LLM del listino chat legge testo per
  // definizione — non c'è un caso reale in cui manchi.
  if (kind === 'text' || has.has(CONNECTOR_MODALITY.text)) out.push('text');
  if (has.has(CONNECTOR_MODALITY.images)) out.push('images');
  if (kind === 'video' && has.has(CONNECTOR_MODALITY.images)) {
    out.push('first_frame', 'last_frame');
  }
  if (has.has(CONNECTOR_MODALITY.videos)) out.push('videos');
  if (has.has(CONNECTOR_MODALITY.audios)) out.push('audios');

  return out;
}

export type WiredConnector = {
  edgeId: string;
  sourceNodeId: string;
  connector: ConnectorType;
};

/**
 * GLI ARCHI CHE UN CAMBIO DI MODELLO LASCEREBBE SENZA UNA PORTA. Non un booleano: il DIALOGO che
 * chiede conferma deve nominare ESATTAMENTE quali fili cadono, non dire "3 collegamenti" — la
 * stessa idea di `delete-plan.ts::planDelete`, che restituisce gli id concreti invece di un
 * conteggio, e che questo file segue invece di inventare una seconda forma.
 *
 * VUOTO = NESSUN DIALOGO. Il caso comune — cambiare fra due modelli con le stesse modalità — resta
 * un clic solo: un conferma che compare sempre è una conferma che nessuno legge più.
 */
export function orphanedByModelChange(wired: WiredConnector[], nextConnectors: ConnectorType[]): WiredConnector[] {
  const next = new Set(nextConnectors);
  return wired.filter((w) => !next.has(w.connector));
}

export type ModelWithModalities = { id: string; inputModalities?: string[] };

export function connectorsForNode(
  kind: GenerativeNodeKind,
  model: string | null,
  choices: readonly ModelWithModalities[]
): ConnectorType[] {
  const chosen = effectiveModel(kind, model, choices);
  const choice = chosen ? choices.find((c) => c.id === chosen) : undefined;
  if (kind !== 'text' && !choice) {
    return [];
  }
  return connectorsFor(kind, { input: choice?.inputModalities ?? [] });
}

const PORTS_ACCEPTING: Record<ConnectorType, readonly ConnectorType[]> = {
  text: ['text'],
  images: ['images', 'first_frame', 'last_frame'],
  videos: ['videos'],
  audios: ['audios'],
  first_frame: [],
  last_frame: []
};

export function portAccepts(port: ConnectorType, output: ConnectorType): boolean {
  return PORTS_ACCEPTING[output].includes(port);
}

export function anyPortAccepts(ports: readonly ConnectorType[], output: ConnectorType): boolean {
  return ports.some((port) => portAccepts(port, output));
}

export type PortSide = 'source' | 'target';

export type PortAt = { nodeId: string; handleId: string | null };

export type DragOrigin = ({ side: PortSide; type: ConnectorType | null } & Partial<PortAt>) | null;

function isOriginPort(origin: NonNullable<DragOrigin>, side: PortSide, at: PortAt | undefined): boolean {
  return !!at && origin.side === side && origin.nodeId === at.nodeId && (origin.handleId ?? null) === at.handleId;
}

export function portActive(origin: DragOrigin, side: PortSide, type: ConnectorType, at?: PortAt): boolean {
  if (!origin || !origin.type) {
    return true;
  }
  if (isOriginPort(origin, side, at)) {
    return true;
  }
  if (origin.side === side) {
    return false;
  }
  return side === 'target' ? portAccepts(type, origin.type) : portAccepts(origin.type, type);
}

export function landingPort(
  dropped: ConnectorType | null,
  output: ConnectorType | null,
  ports: readonly ConnectorType[]
): ConnectorType | null {
  if (!output) {
    return dropped;
  }
  if (dropped && ports.includes(dropped) && portAccepts(dropped, output)) {
    return dropped;
  }
  return ports.find((port) => portAccepts(port, output)) ?? dropped;
}
