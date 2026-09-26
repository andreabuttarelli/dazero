/**
 * COSA NASCE DA UN DUPLICA (⌘D) O DA UN INCOLLA (⌘V): la selezione più le linee che stanno
 * INTERAMENTE dentro di lei — un arco con un solo capo fuori dalla selezione non si duplica, si
 * lascia stare, perché copiarlo darebbe un filo verso il nodo originale che nessuno ha chiesto.
 *
 * PURO: non chiama il server, non genera id. Ogni nodo copiato nasce con un INDICE (`sourceIndex`,
 * la sua posizione nell'elenco selezionato) invece di un id vero — il server è l'unico che può
 * dare un id, e una funzione pura non può indovinarlo. Le linee copiate portano quegli stessi
 * indici (`sourceIndex`/`targetIndex`) al posto di `source`/`target`: chi esegue il piano (la
 * pagina, dopo che il server ha risposto con gli id nuovi) traduce indice → id appena li ha in
 * mano.
 *
 * IL CONTENUTO SI PORTA, LO STATO DI CORSA NO. `stripRunState` toglie `running`/`error`/`refId`
 * dai tipi che generano: un duplicato che nasce già "in corso" o già "fallito" racconterebbe un
 * giro che non è mai partito su QUESTA riga. Il prompt, il modello, i parametri restano — sono la
 * configurazione, non la storia.
 */

export type DuplicateNode = { id: string; type: string; data: Record<string, unknown>; x: number; y: number };
export type DuplicateEdge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null };

export type DuplicatedNode = { sourceIndex: number; type: string; data: Record<string, unknown>; x: number; y: number };
export type DuplicatedEdge = {
  sourceIndex: number;
  targetIndex: number;
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type DuplicatePlan = { nodes: DuplicatedNode[]; edges: DuplicatedEdge[] };

const RUN_STATE_KEYS = ['running', 'error', 'refId', 'run_id', 'runId'] as const;

function stripRunState(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  for (const key of RUN_STATE_KEYS) {
    delete next[key];
  }
  return next;
}

export function planDuplicate(input: {
  ids: string[];
  nodes: DuplicateNode[];
  edges: DuplicateEdge[];
  offset: { dx: number; dy: number };
}): DuplicatePlan {
  const chosen = new Set(input.ids);
  const selected = input.nodes.filter((n) => chosen.has(n.id));
  const indexOf = new Map(selected.map((n, i) => [n.id, i]));

  const nodes: DuplicatedNode[] = selected.map((n) => ({
    sourceIndex: indexOf.get(n.id)!,
    type: n.type,
    data: stripRunState(n.data),
    x: n.x + input.offset.dx,
    y: n.y + input.offset.dy
  }));

  const edges: DuplicatedEdge[] = input.edges
    .filter((e) => indexOf.has(e.source) && indexOf.has(e.target))
    .map((e) => ({
      sourceIndex: indexOf.get(e.source)!,
      targetIndex: indexOf.get(e.target)!,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }));

  return { nodes, edges };
}

/** Il passo di ogni duplicato successivo: visibile accanto all'originale, non sopra di lui. */
export const DUPLICATE_OFFSET = { dx: 32, dy: 32 };
