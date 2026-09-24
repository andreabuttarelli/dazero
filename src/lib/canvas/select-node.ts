/**
 * IL NODO `select`: sceglie UN item da una `list` a monte, per indice 1-based — la stessa cifra
 * che compare sul nodo e sul thumbnail cliccato (`node-data.ts::selectSchema`), senza una
 * traduzione da tenere sincronizzata fra UI e storage. L'output ha il medium della lista ed è a
 * valore singolo: può alimentare qualunque porta che un nodo a valore singolo alimenterebbe.
 *
 * PURO: nessun database. `select` non sa QUALE lista lo alimenta — lo dice `upstream.ts`, che ha
 * un `db` — sa solo come si legge e si clampa un indice contro una lunghezza nota.
 */
export type SelectNode = {
  id: string;
  index: number;
};

const SELECT_NODE_SIZE = { w: 280, h: 220 };

export function selectNodeSize(): { w: number; h: number } {
  return { ...SELECT_NODE_SIZE };
}

export type NewSelectTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
  connectable: true;
};

export function newSelectNodeAt(at: { x: number; y: number }): NewSelectTile {
  const { w, h } = selectNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    index: 1,
    connectable: true
  };
}

/**
 * UN INDICE 1-BASED, DENTRO I LIMITI DI `length` — mai zero, mai negativo, mai oltre la lista.
 * `length` assente o zero (la lista a monte non è ancora nota, o è vuota) lascia SOLO il minimo:
 * clampare a 0 nasconderebbe che non c'è ancora niente da scegliere, che è un fatto diverso da
 * "scegli il primo".
 */
export function clampIndex(index: number, length: number): number {
  const rounded = Math.round(index);
  if (!Number.isFinite(rounded) || rounded < 1) return 1;
  if (length <= 0) return rounded;
  return Math.min(rounded, length);
}

/**
 * LA LISTA CHE ALIMENTA QUESTO `select`, LATO CLIENT — la stessa disciplina deterministica di
 * `upstream.ts::listFeeding`: il PRIMO arco entrante la cui sorgente è una `list`, mai una scelta
 * fra più liste diverse. Serve solo per l'ANTEPRIMA sulla tela (il thumbnail cliccato, il conteggio
 * per il clamp): la scrittura vera dell'indice resta un valore libero finché il server non la
 * rifiuta, la stessa disciplina di ogni altro campo su questo nodo.
 */
export function listFeedingSelect<TNode extends { id: string; type: string }>(
  targetId: string,
  edges: { sourceNodeId: string; targetNodeId: string }[],
  nodesById: Map<string, TNode>
): TNode | null {
  for (const edge of edges) {
    if (edge.targetNodeId !== targetId) continue;
    const source = nodesById.get(edge.sourceNodeId);
    if (source?.type === 'list') return source;
  }
  return null;
}
