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
 * I LIMITI VENGONO DAL CATALOGO DEL MODELLO, mai da qui: `acceptedInputs` (in `graph.ts`) legge
 * `videoRefCapacity` e `imageModelSpec(...).maxRefs`, e questo file la CHIAMA — non li riscrive.
 * Un modello che accetta tre immagini e un nodo che ne porta cinque perde le due in più con la
 * ragione, non in silenzio.
 *
 * QUESTO FILE PUÒ DIRE «IL MODELLO NE ACCETTA N» ANCHE QUANDO IL TRASPORTO DI OGGI NE MANDA UNA
 * SOLA. `referenceImageUrls` porta TUTTE le immagini che il catalogo accetta; `referenceImageUrl`
 * è la prima, la sola che `generateImagesWithoutBrand` sa spedire oggi (`ImageJob.baseMediaId`, un
 * campo, non una lista). La separazione è voluta: quando quel trasporto imparerà a portarne più di
 * una, il chiamante smette di leggere `referenceImageUrl` e legge la lista — senza toccare questo
 * file, che la lista la calcola già.
 */
import { acceptedInputs, mediumOf, type CanvasNode, type Medium } from './graph';

export const VIDEO_START_HANDLE = 'start_frame';
export const VIDEO_END_HANDLE = 'end_frame';

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
  /** TUTTE le immagini di riferimento che il modello scelto accetta, nell'ordine deterministico.
   *  Su un video sono i riferimenti multimodali OLTRE al fotogramma iniziale; su un'immagine sono
   *  quante `imageModelSpec(model).maxRefs` ne regge — oggi il trasporto ne spedisce solo la prima. */
  referenceImageUrls: string[];
  /** Il fotogramma iniziale di un video, quando un'immagine è collegata alla maniglia giusta o è
   *  la prima immagine senza maniglia dichiarata. */
  startFrameUrl: string | null;
  /** Il fotogramma finale: richiede `startFrameUrl`, mai da solo. */
  endFrameUrl: string | null;
  rejected: UpstreamRejection[];
};

const EMPTY: UpstreamInputs = {
  text: [],
  referenceImageUrl: null,
  referenceImageUrls: [],
  startFrameUrl: null,
  endFrameUrl: null,
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

function videoHandleFor(edge: UpstreamEdge, startAssigned: boolean): 'start' | 'end' | 'reference' {
  if (edge.targetHandle === VIDEO_START_HANDLE) return 'start';
  if (edge.targetHandle === VIDEO_END_HANDLE) return 'end';
  if (!edge.targetHandle && !startAssigned) return 'start';
  return 'reference';
}

/**
 * QUEL CHE UN NODO RICEVE, RISOLTO. `at` guarda i nodi per id — la stessa forma di `NodeLookup`
 * in `connect-rules.ts`, perché un chiamante che ha già quella mappa non deve costruirne una
 * seconda.
 */
export function resolveUpstreamInputs(
  nodes: UpstreamNode[],
  edges: UpstreamEdge[],
  targetId: string
): UpstreamInputs {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const target = at.get(targetId);
  if (!target) return EMPTY;

  if (hasUpstreamCycle(edges, targetId)) {
    return { ...EMPTY, rejected: [{ nodeId: targetId, why: 'ciclo: questo nodo dipende da se stesso' }] };
  }

  const ordered = incomingEdges(edges, targetId);
  const targetCanvasNode = toCanvasNode(target);

  const sourceCanvasNodes: CanvasNode[] = [];
  const bySourceId = new Map<string, UpstreamNode>();
  for (const edge of ordered) {
    const source = at.get(edge.sourceNodeId);
    if (!source) continue;
    bySourceId.set(source.id, source);
    sourceCanvasNodes.push(toCanvasNode(source));
  }

  const verdict = acceptedInputs(targetCanvasNode, sourceCanvasNodes);
  const acceptedIds = new Set(verdict.accepted.map((n) => n.id));
  const rejected: UpstreamRejection[] = verdict.rejected.map((n) => ({
    nodeId: n.id,
    why: verdict.why ?? 'input non accettato'
  }));

  const text: string[] = [];
  let startFrameUrl: string | null = null;
  let endFrameUrl: string | null = null;
  const referenceImageUrls: string[] = [];

  for (const edge of ordered) {
    const source = bySourceId.get(edge.sourceNodeId);
    if (!source || !acceptedIds.has(source.id)) continue;

    const medium: Medium = mediumOf(toCanvasNode(source));

    if (medium === 'text') {
      if (!source.text?.trim()) {
        rejected.push({ nodeId: source.id, why: 'nodo di testo non ancora girato: niente da dare' });
        continue;
      }
      text.push(source.text);
      continue;
    }

    if (medium === 'image') {
      if (!source.mediaUrl) {
        rejected.push({ nodeId: source.id, why: 'nodo immagine non ancora girato: niente da dare' });
        continue;
      }

      if (targetCanvasNode.kind !== 'video') {
        referenceImageUrls.push(source.mediaUrl);
        continue;
      }

      const slot = videoHandleFor(edge, startFrameUrl !== null);
      if (slot === 'start') {
        startFrameUrl = source.mediaUrl;
      } else if (slot === 'end') {
        endFrameUrl = source.mediaUrl;
      } else {
        referenceImageUrls.push(source.mediaUrl);
      }
    }
  }

  if (endFrameUrl && !startFrameUrl) {
    rejected.push({ nodeId: targetId, why: 'un fotogramma finale richiede un fotogramma iniziale' });
    endFrameUrl = null;
  }

  return {
    text,
    referenceImageUrl: referenceImageUrls[0] ?? null,
    referenceImageUrls,
    startFrameUrl,
    endFrameUrl,
    rejected
  };
}
