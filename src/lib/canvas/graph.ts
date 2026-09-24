/**
 * COSA UNA COSA È, COSA UNA COSA FA, E QUALI ARCHI HANNO SENSO.
 *
 * Due assi, e confonderli è il difetto che questo file esiste per evitare.
 *
 *   IL MEDIUM è cosa una cosa È: testo, immagine, video. È la domanda che decide se un arco può
 *   esistere — un prompt alimenta un'immagine, un fotogramma alimenta un video.
 *
 *   IL RUOLO è cosa una cosa FA nel prodotto: un post, un documento, una memoria, un materiale di
 *   libreria. Il prodotto lo tiene già separato: `brand_media.kind` è il medium, mentre
 *   `posts.content_type` è il ruolo con dentro il medium (`generated_video`, `text`, `link`).
 *
 * Un post non HA un medium: lo prende dal suo contenuto. Un post-video e un post-testo sono lo
 * stesso ruolo e due medium diversi, e tenerli su un asse solo darebbe un elenco di tipi che
 * cresce moltiplicando invece che sommando.
 *
 * UNA TABELLA SOLA, e non è estetica: il CLAUDE.md lo chiede per le eccezioni — si dichiarano in
 * un posto solo, accanto al modello che le governa, dove il caso nuovo è una riga e tutti si
 * vedono insieme. Un `if` per «il video non produce immagini», un altro per «la libreria non si
 * genera», un terzo per «il post accetta tutto» sarebbero tre regole che al quarto tipo nessuno sa
 * più elencare.
 *
 * QUI NON SI GENERA NIENTE. Questo file dice cosa SAREBBE lecito e cosa manca; chi esegue è altro
 * codice, che chiama i generatori che il prodotto ha già (`generate_image`, `generate_video`,
 * `create_post`). La validazione separata dall'esecuzione è ciò che permette di dire «questo arco
 * non si può fare» mentre il puntatore è ancora in aria, invece di scoprirlo spendendo.
 */

/** Cosa una cosa È. I tre primitivi, e nient'altro. */
import { videoRefCapacity } from '$lib/video-models';
import { imageModelSpec } from '$lib/image-models';

export const MEDIUMS = ['text', 'image', 'video'] as const;
export type Medium = (typeof MEDIUMS)[number];

/**
 * Cosa una cosa FA. I primi tre sono i primitivi che si generano sulla tela; gli altri sono i
 * ruoli che il prodotto già conosce — le righe di `brand_media`, `brand_documents`,
 * `brand_memory`, `posts`.
 */
export const NODE_KINDS = [
  'text',
  'image',
  'video',
  'post',
  'media',
  'document',
  'memory',
  'iframe'
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export type CanvasNode = {
  id: string;
  kind: NodeKind;
  /** Per un nodo `media`: il `kind` della sua riga, che ne è il medium. */
  mediaKind?: 'image' | 'video';
  /** Per un nodo `post`: il suo `content_type`, da cui si ricava il medium. */
  contentType?: string | null;
  /** Per un nodo che si genera: con quale modello. Decide quanti riferimenti entrano. */
  model?: string | null;
};

type NodeSpec = {
  /** Il medium fisso del tipo, o null quando lo porta il contenuto (i post). */
  medium: Medium | null;
  /** Si produce sulla tela? Una riga di libreria no: esiste già, e un arco verso di lei non farebbe niente. */
  generated: boolean;
  /** I medium che questo tipo può ricevere in ingresso. */
  accepts: readonly Medium[];
  /** Quelli senza cui non si può eseguire. Il resto è facoltativo. */
  requires: readonly Medium[];
};

export const CANVAS_NODE_SPECS: Record<NodeKind, NodeSpec> = {
  // Un testo si scrive, ma si genera anche da un altro testo — quello a monte è il prompt quando
  // il nodo non ne ha ancora uno suo. Nessun ingresso è richiesto: il punto di partenza di ogni
  // catena resta un testo mai collegato a niente, con il prompt scritto a mano.
  text: { medium: 'text', generated: true, accepts: ['text'], requires: [] },
  // Un'immagine nasce da un prompt, e un'altra immagine collegata è il riferimento da riprodurre
  // fedelmente (`ImageJob.baseMediaId`) — non un prompt in più, quindi resta facoltativa.
  image: { medium: 'image', generated: true, accepts: ['text', 'image'], requires: ['text'] },
  // Un video nasce dal prompt; un'immagine e un altro video sono riferimenti facoltativi — il
  // prodotto sa girare una clip dal solo testo, e chiederli bloccherebbe quel percorso. Un video
  // collegato è un riferimento multimodale (`referenceVideoUrls`), non un fotogramma: quello è
  // ciò che una MANIGLIA esplicita dice, non ciò che ogni immagine porta di default.
  video: { medium: 'video', generated: true, accepts: ['text', 'image', 'video'], requires: ['text'] },
  // Un post è un contenitore: prende ciò che gli si dà, e il suo medium lo porta il contenuto.
  post: { medium: null, generated: true, accepts: ['text', 'image', 'video'], requires: ['text'] },
  // Le tre righe che esistono già nel database. Niente le genera: sono sorgenti.
  media: { medium: null, generated: false, accepts: [], requires: [] },
  document: { medium: 'text', generated: false, accepts: [], requires: [] },
  memory: { medium: 'text', generated: false, accepts: [], requires: [] },
  // Una pagina incorporata è una SORGENTE come le tre qui sopra: esiste già, e niente la produce.
  // È testo perché quel che se ne può usare a valle è quel che c'è scritto — «riassumi questa
  // pagina», «fai un'immagine ispirata a questa» sono le catene che la rendono utile. L'immagine
  // che il sito mostra non è sua: è del sito, e non c'è un file da passare a valle.
  iframe: { medium: 'text', generated: false, accepts: [], requires: [] }
};

/** Da `posts.content_type` al medium: è il ruolo che porta dentro il medium, e qui si separano. */
function mediumFromContentType(contentType: string | null | undefined): Medium {
  const t = String(contentType ?? '');
  if (t.includes('video')) return 'video';
  if (t.includes('image') || t.includes('graphic')) return 'image';
  return 'text';
}

/** Cosa questo nodo È. */
export function mediumOf(node: CanvasNode): Medium {
  const spec = CANVAS_NODE_SPECS[node.kind];
  if (spec?.medium) return spec.medium;
  if (node.kind === 'media') return node.mediaKind === 'video' ? 'video' : 'image';
  if (node.kind === 'post') return mediumFromContentType(node.contentType);
  return 'text';
}

export type Verdict = { ok: true } | { ok: false; why: string };

/**
 * Questo arco può esistere? Si risponde PRIMA di eseguire, mentre il puntatore è ancora in aria:
 * scoprire che una connessione non produce niente dopo aver speso è il modo peggiore di dirlo.
 */
export function canConnect(from: CanvasNode, to: CanvasNode): Verdict {
  if (from.id === to.id) {
    return { ok: false, why: 'un nodo non si collega a se stesso' };
  }
  const target = CANVAS_NODE_SPECS[to.kind];
  if (!target) {
    return { ok: false, why: `tipo sconosciuto: ${to.kind}` };
  }
  if (!target.generated) {
    return { ok: false, why: `${to.kind} esiste già: non si genera da altri nodi` };
  }
  const medium = mediumOf(from);
  if (!target.accepts.includes(medium)) {
    return { ok: false, why: `un ${ITALIAN[medium]} non alimenta un nodo ${ITALIAN[mediumOf(to)] ?? to.kind}` };
  }
  return { ok: true };
}

const ITALIAN: Record<Medium, string> = { text: 'testo', image: 'immagine', video: 'video' };

/** I medium che mancano perché il nodo possa produrre. Vuoto = pronto. */
export function missingInputs(node: CanvasNode, incoming: CanvasNode[]): Medium[] {
  const spec = CANVAS_NODE_SPECS[node.kind];
  if (!spec?.generated) return [];
  const have = new Set(incoming.map(mediumOf));
  return spec.requires.filter((m) => !have.has(m));
}

export function readyToRun(node: CanvasNode, incoming: CanvasNode[]): boolean {
  return missingInputs(node, incoming).length === 0;
}

/**
 * QUANTI INGRESSI ENTRANO DAVVERO, e non è uno per tipo.
 *
 * Un video Seedance prende trenta immagini di riferimento, dieci clip e dieci tracce audio; Grok
 * nessuno. I numeri stanno in `videoRefCapacity`, accanto al modello che li governa, perché sono
 * un fatto di quel modello come le durate e il tetto del prompt — non una regola della tela.
 *
 * IL SOVRAPPIÙ SI RIFIUTA, NON SPARISCE. Tagliare in silenzio la trentunesima immagine è il modo
 * per cui qualcuno collega un riferimento, non lo vede nel risultato e non capisce perché: qui
 * torna in `rejected` con il motivo, e chi disegna la tela può dirlo.
 */
export type InputVerdict = {
  accepted: CanvasNode[];
  rejected: CanvasNode[];
  why: string | null;
};

export function acceptedInputs(node: CanvasNode, incoming: CanvasNode[]): InputVerdict {
  const spec = CANVAS_NODE_SPECS[node.kind];
  if (!spec?.generated) {
    return { accepted: [], rejected: incoming, why: `${node.kind} non si genera da altri nodi` };
  }

  const caps = capacityOf(node);
  const accepted: CanvasNode[] = [];
  const rejected: CanvasNode[] = [];
  const used: Record<Medium, number> = { text: 0, image: 0, video: 0 };
  let why: string | null = null;

  for (const source of incoming) {
    const medium = mediumOf(source);
    const room = caps[medium] ?? 0;
    if (!spec.accepts.includes(medium)) {
      rejected.push(source);
      why ??= `un ${ITALIAN[medium]} non alimenta questo nodo`;
      continue;
    }
    if (used[medium] >= room) {
      rejected.push(source);
      why ??=
        room === 0
          ? `questo modello non prende ${ITALIAN[medium]} di riferimento`
          : `al massimo ${room} ${ITALIAN[medium]} in ingresso`;
      continue;
    }
    used[medium] += 1;
    accepted.push(source);
  }
  return { accepted, rejected, why };
}

/** Quanti ingressi per medium: dal modello quando c'è, altrimenti uno per tipo. */
function capacityOf(node: CanvasNode): Record<Medium, number> {
  if (node.kind === 'video') {
    const caps = videoRefCapacity(node.model);
    // Il prompt è sempre uno: due prompt sono due video, non un video con due prompt.
    //
    // Sulle immagini vale il tetto del modello — che sia un fotogramma su una maniglia esplicita
    // o un riferimento multimodale, entrambi arrivano come immagini collegate a questo nodo, e il
    // tetto del provider è sullo STESSO campo (`frame_images` + `input_references` condividono il
    // conto in `video.ts`). Un modello senza riferimenti multimodali tiene comunque un'immagine:
    // il fotogramma iniziale resta possibile ovunque, è il caso `Math.max(caps.images, 1)`.
    return { text: 1, image: Math.max(caps.images, 1), video: caps.videos };
  }
  // Un post raccoglie ciò che gli si dà: è un contenitore, non un modello con i suoi limiti.
  if (node.kind === 'post') return { text: 1, image: 20, video: 5 };
  // Un'immagine di riferimento è quante il MODELLO scelto ne accetta davvero (`maxRefs`, da 3 a
  // 16): un tetto uguale per tutti mentirebbe agli stessi due versi di `video`. Senza un modello
  // noto resta 1 — il caso oggi eseguito (`baseMediaId`), mai un numero inventato.
  if (node.kind === 'image') return { text: 1, image: imageModelSpec(node.model)?.maxRefs ?? 1, video: 0 };
  return { text: 1, image: 1, video: 0 };
}
