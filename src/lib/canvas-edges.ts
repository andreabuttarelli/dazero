/**
 * GLI ARCHI DELLA TELA, dal database a quel che SvelteFlow disegna.
 *
 * Il vocabolario è chiuso e sta in tre posti che devono dire la stessa cosa: il check in
 * migrazione, questo elenco e l'etichetta che si legge sulla linea. Il primo è l'unico che morde
 * — ed è per questo che `isCanvasEdgeKind` esiste: rifiutare qui un verso inventato dà un errore
 * che nomina le tre parole ammesse, invece di un 23514 che nomina un vincolo.
 *
 * UNA LINEA NON RESTA MAI MUTA. Senza etichetta bisogna indovinare perché due cose sono unite, che
 * è esattamente l'informazione per cui l'arco è stato creato: in mancanza della didascalia di una
 * persona si mostra il verso.
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

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  /**
   * Il verso, addosso alla linea disegnata. Non si ricava dall'etichetta: quella può essere la
   * didascalia di una persona, e allora il verso non si leggerebbe più da nessuna parte — il menù
   * che lo cambia lo sbaglierebbe appena qualcuno scrive «insieme a» su una derivazione.
   */
  kind: CanvasEdgeKind;
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
    label: row.label ?? EDGE_KIND_LABEL[row.kind],
    kind: row.kind,
    ...(row.kind === 'groups_with' ? {} : { markerEnd: { type: 'arrowclosed' as const } })
  }));
}
