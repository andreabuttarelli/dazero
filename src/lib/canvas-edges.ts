/**
 * GLI ARCHI DELLA TELA, dal database a quel che SvelteFlow disegna.
 *
 * Il vocabolario è chiuso e sta in due posti che devono dire la stessa cosa: il check in
 * migrazione e questo elenco. Il primo è l'unico che morde — ed è per questo che
 * `isCanvasEdgeKind` esiste: rifiutare qui un verso inventato dà un errore che nomina le tre
 * parole ammesse, invece di un 23514 che nomina un vincolo.
 *
 * LA LINEA RESTA MUTA: nessun testo ci si disegna sopra. Il verso lo dice `kind`, letto dal menù
 * che compare al clic (`EDGE_KIND_LABEL`) — mai scritto sulla tela, dove affollerebbe un disegno
 * che deve restare leggibile con molti archi insieme.
 */

/** Gli stessi tre valori del check in migrazione: due elenchi divergerebbero al primo verso nuovo. */
export const CANVAS_EDGE_KINDS = ['derives_from', 'responds_to', 'groups_with'] as const;

export type CanvasEdgeKind = (typeof CANVAS_EDGE_KINDS)[number];

export function isCanvasEdgeKind(x: string): x is CanvasEdgeKind {
  return (CANVAS_EDGE_KINDS as readonly string[]).includes(x);
}

/**
 * Come si legge un verso, sulla linea e nel menù che lo cambia. Esportato perché le superfici sono
 * due: un secondo elenco scritto a mano nel componente direbbe «nasce da» in un posto e «derivato
 * da» nell'altro, sulla stessa linea.
 */
export const EDGE_KIND_LABEL: Record<CanvasEdgeKind, string> = {
  derives_from: 'nasce da',
  responds_to: 'risponde a',
  groups_with: 'insieme a'
};

/** Le colonne di `brand_canvas_edges` che servono a disegnare. */
export type CanvasEdgeRow = {
  id: string;
  source_item_id: string;
  target_item_id: string;
  kind: CanvasEdgeKind;
  label: string | null;
};

/**
 * FISSO O ITERATE: il toggle che rende un filo un asse del loop a valle (`loop-plan.ts`) — gli
 * stessi due valori di `nodes_connections_mode_check`, letti da `nodes_connections.mode`
 * (`server/repos/canvas.ts::WireMode`, che li dichiara di nuovo per il proprio uso lato server:
 * due letture della stessa colonna, non due verità che possano divergere, perché entrambe restano
 * quei due valori). `fixed` entra in OGNI iterazione a valle, `iterate` è un asse del prodotto
 * cartesiano/zip.
 */
export const WIRE_MODES = ['fixed', 'iterate'] as const;

export type WireMode = (typeof WIRE_MODES)[number];

export function isWireMode(x: string): x is WireMode {
  return (WIRE_MODES as readonly string[]).includes(x);
}

export const WIRE_MODE_LABEL: Record<WireMode, string> = {
  fixed: 'fisso',
  iterate: 'iterate'
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  /** Mai disegnata sulla linea: il menù al clic (`EDGE_KIND_LABEL`) resta l'unico posto che la
   *  mostra. Il campo è assente qui, non una stringa vuota — SvelteFlow non disegna un'etichetta
   *  quando `label` non c'è. */
  label?: undefined;
  kind: CanvasEdgeKind;
  /** `nodes_connections.mode` — assente sugli archi che questo file non conosce ancora (un arco
   *  arrivato da `toFlowEdges`, che legge `brand_canvas_edges` e non porta `mode`): il menù al
   *  clic tratta l'assenza come `fixed`, lo stesso di riserva del repository server. */
  mode?: WireMode;
  /** Assente su `groups_with`: stare insieme non ha un verso, e una freccia ne inventerebbe uno. */
  markerEnd?: { type: 'arrowclosed' };
  /** La porta di `target` su cui questo arco atterra (`ConnectorType` di `connectors.ts`). Assente
   *  sull'unico attacco generico di prima, o su un arco verso un nodo senza porte tipizzate. */
  targetHandle?: string | null;
};

export function toFlowEdges(rows: CanvasEdgeRow[]): FlowEdge[] {
  return rows.map((row) => ({
    id: row.id,
    source: row.source_item_id,
    target: row.target_item_id,
    kind: row.kind,
    ...(row.kind === 'groups_with' ? {} : { markerEnd: { type: 'arrowclosed' as const } })
  }));
}
