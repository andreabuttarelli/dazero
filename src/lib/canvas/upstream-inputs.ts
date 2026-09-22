/**
 * COSA UN NODO RICEVE DA CHI GLI È COLLEGATO, PRIMA DI GIRARE.
 *
 * `connect-rules.ts` dice se un arco è LECITO; questo file dice, per un arco lecito, CHE COSA
 * porta — un blocco di testo, un'immagine di riferimento, un fotogramma iniziale o finale, un
 * audio. È pura logica di input→output: nessun database, nessuna chiamata a un modello, per
 * essere testabile senza nessuno dei due (CLAUDE.md, Kent Beck).
 *
 * LO STATO DI UN NODO SORGENTE è quel che l'ha già prodotto: `data.refId` per un nodo che genera
 * (scritto da `generate.ts::land`), `data.content` per un `doc`. Un nodo testo mai girato non ha
 * `refId` — non ha niente da dare, e la scelta è dichiarata qui una volta sola: si salta, non si
 * rifiuta l'intero giro, perché un input opzionale mancante non deve fermare gli altri.
 *
 * L'ORDINE È DETERMINISTICO: la maniglia (`source_handle`/`target_handle`) prima, l'id
 * dell'arco come spareggio poi. Senza, due immagini collegate allo stesso nodo genererebbero un
 * risultato diverso ogni giro — lo stesso canvas, un output che cambia senza che nessuno lo tocchi.
 *
 * I LIMITI VENGONO DAL CATALOGO DEL MODELLO, mai da qui: quanti fili un connettore a valore
 * multiplo regge viene da `videoRefCapacity`/`imageModelSpec(...).maxRefs` (`listCapacity`, sotto)
 * — questo file li LEGGE, non li riscrive. Un modello che accetta tre immagini e un nodo che ne
 * porta cinque perde le due in più con la ragione, non in silenzio.
 *
 * QUESTO FILE PUÒ DIRE «IL MODELLO NE ACCETTA N» ANCHE QUANDO IL TRASPORTO DI OGGI NE MANDA UNA
 * SOLA. `referenceImageUrls` porta TUTTE le immagini che il catalogo accetta; `referenceImageUrl`
 * è la prima, la sola che `generateImagesWithoutBrand` sa spedire oggi (`ImageJob.baseMediaId`, un
 * campo, non una lista). La separazione è voluta: quando quel trasporto imparerà a portarne più di
 * una, il chiamante smette di leggere `referenceImageUrl` e legge la lista — senza toccare questo
 * file, che la lista la calcola già.
 *
 * UN'IMMAGINE COLLEGATA È UN RIFERIMENTO, NON UN FOTOGRAMMA, DI DEFAULT. `openrouter-video.ts`
 * distingue due cose diverse: `frame_images` porta un RUOLO temporale (`frame_type`, i valori
 * `first_frame`/`last_frame`), `input_references` porta media che il modello guarda senza un
 * ruolo. Un'immagine su un arco qualunque è la seconda — la stessa domanda per testo, immagine,
 * video, audio: «cosa guida questa generazione», mai «con cosa comincia». Un fotogramma è
 * un'eccezione esplicita, e vive SOLO su una delle due maniglie — `FIRST_FRAME_HANDLE` /
 * `LAST_FRAME_HANDLE`, gli stessi nomi di `frame_type` e non un vocabolario nostro — senza quella
 * maniglia l'immagine collegata resta un riferimento, anche se è l'unica collegata.
 *
 * I DUE SLOT SONO OPZIONALI E INDIPENDENTI. Né l'uno né l'altro è testo-a-video; solo il primo è
 * immagine-a-video; entrambi è interpolazione. Nessuna regola locale lega un frame finale a uno
 * iniziale — OpenRouter porta ciascun fotogramma con il proprio `frame_type` nello stesso payload,
 * quindi un frame finale da solo è esprimibile: se il fornitore lo rifiuta, lo dice lui, non lo
 * indoviniamo qui prima di provare.
 *
 * DUE IMMAGINI SULLO STESSO SLOT SONO UN CONFLITTO, non una scelta silenziosa. L'ordine
 * deterministico risolve un ELENCO (i riferimenti); uno slot che accetta un solo valore non ha un
 * "primo che vince" onesto — un canvas con due nodi collegati allo stesso fotogramma deve saperlo,
 * non scoprire dopo il giro quale dei due ha vinto.
 *
 * UN VIDEO COLLEGATO A UN VIDEO è un riferimento multimodale (`referenceVideoUrls`), mai un
 * fotogramma — un video non ha un singolo frame da promuovere a copertina, e nessuno slot lo
 * trasforma in altro. Lo stesso vale per un futuro nodo audio (`referenceAudioUrls`): la forma è
 * pronta anche se oggi niente produce un `UpstreamNode` di medium audio.
 *
 * I CONNETTORI (`connectors.ts`) DECIDONO SE UN ARCO ENTRA — non più una tabella `accepts` per
 * KIND di nodo: `connectorsFor(kind, modalities)` dice quali porte questo nodo ha ORA, dalle
 * modalità sincronizzate del modello scelto, e un arco entra quando il medium della sorgente
 * coincide con una di quelle porte. `modalities` È OBBLIGATORIA: il selettore modello offre solo
 * modelli con una riga sincronizzata in `ai_models` (decisione di prodotto), quindi un nodo con un
 * modello scelto ha sempre le sue modalità note — non c'è più un caso "modello scelto, modalità
 * ignote" da gestire con un fallback. `upstream.ts` la chiede una volta a `ai_models` e la passa
 * qui: questo file resta senza database, la stessa domanda che la UI fa per disegnare le porte
 * prima di collegare niente.
 *
 * QUANTI FILI un connettore a valore multiplo regge resta un fatto D'INTEGRAZIONE, non di
 * modalità: `imageModelSpec(model).maxRefs` e `videoRefCapacity(model)` restano in
 * `image-models.ts`/`video-models.ts`, perché OpenRouter dice COSA un modello accetta, non QUANTI
 * riferimenti la nostra integrazione gli manda in un payload — due domande diverse, due fonti.
 *
 * `UpstreamInputs.blocked` È L'UNICO CAMPO CHE QUESTO FILE NON RIEMPIE MAI (resta sempre `null`
 * qui): dire che un modello non esiste più richiede una lettura ad `ai_models`, che solo
 * `upstream.ts` ha. Il tipo lo dichiara comunque qui perché è la forma che il chiamante
 * (`generate.ts`) legge, indipendentemente da chi l'ha valorizzato.
 */
import { mediumOf, type CanvasNode, type Medium } from './graph';
import { imageModelSpec } from '$lib/image-models';
import { videoRefCapacity } from '$lib/video-models';
import { connectorsFor, type ConnectorType, type GenerativeNodeKind, type Modalities } from './connectors';

/** Gli stessi due valori di `frame_type` in `openrouter-video.ts`: un vocabolario solo. */
export const FIRST_FRAME_HANDLE = 'first_frame';
export const LAST_FRAME_HANDLE = 'last_frame';

export type UpstreamNode = {
  id: string;
  /** Il tipo così come sta su `nodes.type` — la mappa verso `graph.ts` è UNA riga, `toCanvasKind`. */
  type: string;
  model?: string | null;
  /** Il testo che questo nodo dà a valle, quando ne ha uno: `data.content` per un `doc`, il testo
   *  dell'ultimo giro per un `text`. Assente = non ha nulla da dare (non ancora girato). */
  text?: string | null;
  /** L'URL usabile dal renderer, quando questo nodo produce un'immagine o un video. */
  mediaUrl?: string | null;
};

export type UpstreamEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type UpstreamRejection = { nodeId: string; why: string };

export type UpstreamInputs = {
  /** I blocchi di testo a monte, nell'ordine in cui vanno concatenati nel prompt. */
  text: string[];
  /** La prima immagine di riferimento accettata — quella che il trasporto di oggi sa spedire
   *  (`ImageJob.baseMediaId`). Su un nodo immagine è `referenceImageUrls[0]`. */
  referenceImageUrl: string | null;
  /** TUTTE le immagini di riferimento che il modello scelto accetta, nell'ordine deterministico —
   *  ogni immagine collegata SENZA la maniglia di un fotogramma, su un'immagine come su un video.
   *  Su un'immagine sono quante `imageModelSpec(model).maxRefs` ne regge — oggi il trasporto ne
   *  spedisce solo la prima. */
  referenceImageUrls: string[];
  /** I video collegati a un video come riferimento multimodale — mai un fotogramma, un video non
   *  ne ha uno solo da promuovere. Vuoto quando il modello non ne prende (`videoRefCapacity`) o
   *  quando il catalogo sincronizzato (`ai_models`) nega la modalità `video` per quel modello —
   *  quel controllo vive nell'adattatore server (`upstream.ts`), non qui: è l'unico che ha un `db`. */
  referenceVideoUrls: string[];
  /** Audio di riferimento — la forma è pronta anche se oggi nessun nodo produce audio. */
  referenceAudioUrls: string[];
  /** Il fotogramma iniziale: SOLO un'immagine collegata allo slot `first_frame`. Opzionale e
   *  indipendente da `endFrameUrl` — un video può averne uno, l'altro, entrambi o nessuno. */
  startFrameUrl: string | null;
  /** Il fotogramma finale, sullo slot `last_frame`. Non richiede un fotogramma iniziale: se il
   *  provider rifiuta la combinazione lo dice lui, non si indovina qui. */
  endFrameUrl: string | null;
  /**
   * IL NODO NON PUÒ GIRARE, punto — non "questo arco è stato scartato". Il caso vero: il modello
   * che il nodo porta era sincronizzato ieri, `ai_models` non lo conferma più oggi. Non è "non
   * ancora sincronizzato" (quello non può accadere: il selettore offre solo righe sincronizzate) —
   * è un modello SPARITO da sotto un nodo che lo aveva già scelto. `null` = pronto a girare per
   * quel che riguarda il modello; chi chiama (`generate.ts`) rifiuta il giro PRIMA di spendere
   * quando questo campo non è nullo, e il prompt/gli archi/il risultato precedente restano intatti
   * — solo la generazione si ferma. Assegnato dall'adattatore server (`upstream.ts`), mai da qui:
   * questo file non ha un `db` per chiedere ad `ai_models` se il modello esiste ancora.
   */
  blocked: string | null;
  rejected: UpstreamRejection[];
};

const EMPTY: UpstreamInputs = {
  text: [],
  referenceImageUrl: null,
  referenceImageUrls: [],
  referenceVideoUrls: [],
  referenceAudioUrls: [],
  startFrameUrl: null,
  endFrameUrl: null,
  blocked: null,
  rejected: []
};

/** `nodes.type` → il vocabolario di `graph.ts`. Una riga per tipo, non un `if` per file. */
const KIND_MAP: Record<string, CanvasNode['kind']> = {
  text: 'text',
  image: 'image',
  video: 'video',
  doc: 'document',
  iframe: 'iframe'
};

function toCanvasKind(type: string): CanvasNode['kind'] {
  return KIND_MAP[type] ?? 'media';
}

function toCanvasNode(node: UpstreamNode): CanvasNode {
  return { id: node.id, kind: toCanvasKind(node.type), model: node.model ?? null };
}

/**
 * Gli archi che ENTRANO in `targetId`, nell'ordine deterministico: la maniglia sorgente prima
 * (`undefined` in coda — un arco senza maniglia non promette una posizione), poi l'id dell'arco
 * come spareggio stabile.
 */
function incomingEdges(edges: UpstreamEdge[], targetId: string): UpstreamEdge[] {
  return edges
    .filter((e) => e.targetNodeId === targetId)
    .sort((a, b) => {
      const ah = a.sourceHandle ?? '￿';
      const bh = b.sourceHandle ?? '￿';
      if (ah !== bh) return ah < bh ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * UN CICLO NON SI ESEGUE PER SEMPRE. `NEW_DATABASE_STRUCTURE.md` lo vieta per disegno
 * (`connect-rules.ts` dovrebbe rifiutarlo alla connessione), ma niente nel database lo impedisce
 * oggi — questo risolutore non deve fidarsi e girare all'infinito se un ciclo esiste comunque.
 * Un insieme di nodi "in visita" sulla catena corrente basta: non è un tetto di profondità, è la
 * stessa domanda di un DFS — «sto per rientrare in un nodo che mi ha portato qui?».
 */
export function hasUpstreamCycle(
  edges: UpstreamEdge[],
  targetId: string,
  visiting: Set<string> = new Set()
): boolean {
  if (visiting.has(targetId)) return true;

  visiting.add(targetId);
  for (const edge of incomingEdges(edges, targetId)) {
    if (hasUpstreamCycle(edges, edge.sourceNodeId, visiting)) return true;
  }
  visiting.delete(targetId);

  return false;
}

/** `nodes.type` → il kind che `connectors.ts` conosce. `null` per tutto ciò che non genera —
 *  quei nodi non hanno connettori propri, sono sorgenti guardate dall'altro capo dell'arco. */
function generativeKindOf(type: string): GenerativeNodeKind | null {
  if (type === 'text' || type === 'image' || type === 'video') return type;
  return null;
}

/** Il connettore che un MEDIUM di sorgente alimenta, quando non è su uno slot di fotogramma. */
const CONNECTOR_FOR_MEDIUM: Record<Medium, ConnectorType> = {
  text: 'text',
  image: 'images',
  video: 'videos'
};

/**
 * IL CONNETTORE CHE QUESTO ARCO PUNTA. Uno slot di fotogramma vince solo per un'immagine verso un
 * connettore che quel nodo ha davvero — un video collegato su `first_frame` resta `videos`, non
 * diventa un fotogramma che non può essere (vedi il commento in cima al file).
 */
function connectorOf(edge: UpstreamEdge, medium: Medium): ConnectorType {
  if (medium === 'image') {
    if (edge.targetHandle === FIRST_FRAME_HANDLE) return 'first_frame';
    if (edge.targetHandle === LAST_FRAME_HANDLE) return 'last_frame';
  }
  return CONNECTOR_FOR_MEDIUM[medium];
}

/** Quanti fili un connettore a valore multiplo regge — dal catalogo del modello, mai un numero
 *  fisso: la stessa domanda che `graph.ts::capacityOf` faceva, spostata sul connettore. */
function listCapacity(connector: ConnectorType, kind: GenerativeNodeKind, model: string | null): number {
  if (connector === 'images' && kind === 'image') return imageModelSpec(model)?.maxRefs ?? 1;
  if (kind === 'video') {
    const caps = videoRefCapacity(model);
    if (connector === 'images') return Math.max(caps.images, 1);
    if (connector === 'videos') return caps.videos;
    if (connector === 'audios') return caps.audios;
  }
  return 1;
}

const CONNECTOR_LABEL: Record<ConnectorType, string> = {
  text: 'testo',
  images: 'immagine',
  videos: 'video',
  audios: 'audio',
  first_frame: FIRST_FRAME_HANDLE,
  last_frame: LAST_FRAME_HANDLE
};

/**
 * QUEL CHE UN NODO RICEVE, RISOLTO. `at` guarda i nodi per id — la stessa forma di `NodeLookup`
 * in `connect-rules.ts`, perché un chiamante che ha già quella mappa non deve costruirne una
 * seconda. `modalities` è GIÀ RISOLTA da chi chiama (`upstream.ts` la chiede a `ai_models`): qui
 * decide solo quali porte il modello scelto apre, mai come trovarle.
 */
export function resolveUpstreamInputs(
  nodes: UpstreamNode[],
  edges: UpstreamEdge[],
  targetId: string,
  modalities: Modalities
): UpstreamInputs {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const target = at.get(targetId);
  if (!target) return EMPTY;

  if (hasUpstreamCycle(edges, targetId)) {
    return { ...EMPTY, rejected: [{ nodeId: targetId, why: 'ciclo: questo nodo dipende da se stesso' }] };
  }

  const targetKind = generativeKindOf(target.type);
  if (!targetKind) {
    return { ...EMPTY, rejected: [{ nodeId: targetId, why: `${target.type} non si genera da altri nodi` }] };
  }

  const ordered = incomingEdges(edges, targetId);
  const connectors = new Set(connectorsFor(targetKind, modalities));

  const rejected: UpstreamRejection[] = [];
  const text: string[] = [];
  let startFrameUrl: string | null = null;
  let startFrameSourceId: string | null = null;
  let endFrameUrl: string | null = null;
  let endFrameSourceId: string | null = null;
  const referenceImageUrls: string[] = [];
  const referenceVideoUrls: string[] = [];
  const referenceAudioUrls: string[] = [];
  const used: Partial<Record<ConnectorType, number>> = {};

  for (const edge of ordered) {
    const source = at.get(edge.sourceNodeId);
    if (!source) continue;

    const medium: Medium = mediumOf(toCanvasNode(source));
    const connector = connectorOf(edge, medium);

    if (!connectors.has(connector)) {
      rejected.push({ nodeId: source.id, why: `questo modello non ha un connettore ${CONNECTOR_LABEL[connector]}` });
      continue;
    }

    if (connector === 'text') {
      if (!source.text?.trim()) {
        rejected.push({ nodeId: source.id, why: 'nodo di testo non ancora girato: niente da dare' });
        continue;
      }
      text.push(source.text);
      continue;
    }

    if (connector === 'first_frame' || connector === 'last_frame') {
      if (!source.mediaUrl) {
        rejected.push({ nodeId: source.id, why: 'nodo immagine non ancora girato: niente da dare' });
        continue;
      }

      // DUE IMMAGINI SULLO STESSO SLOT SONO UN CONFLITTO: uno slot porta un valore solo, e
      // scegliere in silenzio quale delle due vince è il difetto che si scopre nel video
      // sbagliato, non nel canvas che l'ha causato.
      if (connector === 'first_frame') {
        if (startFrameUrl && startFrameSourceId !== source.id) {
          rejected.push({ nodeId: source.id, why: `due immagini collegate a ${FIRST_FRAME_HANDLE}: solo una può esserlo` });
          continue;
        }
        startFrameUrl = source.mediaUrl;
        startFrameSourceId = source.id;
      } else {
        if (endFrameUrl && endFrameSourceId !== source.id) {
          rejected.push({ nodeId: source.id, why: `due immagini collegate a ${LAST_FRAME_HANDLE}: solo una può esserlo` });
          continue;
        }
        endFrameUrl = source.mediaUrl;
        endFrameSourceId = source.id;
      }
      continue;
    }

    // I tre connettori a valore multiplo: images, videos, audios.
    if (!source.mediaUrl) {
      rejected.push({ nodeId: source.id, why: `nodo ${CONNECTOR_LABEL[connector]} non ancora girato: niente da dare` });
      continue;
    }

    const room = listCapacity(connector, targetKind, target.model ?? null);
    const count = used[connector] ?? 0;
    if (count >= room) {
      rejected.push({
        nodeId: source.id,
        why: room === 0 ? `questo modello non prende ${CONNECTOR_LABEL[connector]} di riferimento` : `al massimo ${room} ${CONNECTOR_LABEL[connector]} in ingresso`
      });
      continue;
    }
    used[connector] = count + 1;

    if (connector === 'images') referenceImageUrls.push(source.mediaUrl);
    else if (connector === 'videos') referenceVideoUrls.push(source.mediaUrl);
    else referenceAudioUrls.push(source.mediaUrl);
  }

  return {
    text,
    referenceImageUrl: referenceImageUrls[0] ?? null,
    referenceImageUrls,
    referenceVideoUrls,
    referenceAudioUrls,
    startFrameUrl,
    endFrameUrl,
    blocked: null,
    rejected
  };
}
