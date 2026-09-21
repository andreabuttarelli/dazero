/**
 * IL PONTE FRA LA TELA E IL MODELLO: da due id di tile a un verdetto.
 *
 * `graph.ts` sa dire se un arco ha senso, ma parla di `CanvasNode` — medium, ruolo, modello. La
 * tela parla di id. Questo file è la traduzione, ed è l'unico posto dove `canConnect` viene
 * chiamato: dentro il componente la stessa domanda finirebbe scritta due volte — una per
 * accendere il verde sull'attacco, una per decidere se salvare — e le due diverrebbero diverse al
 * primo caso nuovo.
 *
 * CHI NON SI CONOSCE NON SI RIFIUTA, e non è indulgenza: il recap del workbench non è un
 * `CanvasNode` e non lo sarà mai — riassume, non produce. Rifiutare ogni tile senza tipo
 * spegnerebbe archi fra cose vere ogni volta che il chiamante non ha ancora descritto un nodo, e
 * il difetto si vedrebbe come «a volte la linea non si tira», che è il peggiore da diagnosticare.
 * Chi non deve collegarsi lo dichiara con `connectable: false`, che è un'altra domanda.
 *
 * `groups_with` NON PASSA DA `canConnect`. Quella funzione risponde a «questo alimenta quello»;
 * stare insieme non alimenta niente — tre post della stessa campagna non si producono a vicenda.
 * Quindi è il verso che resta quando il resto non ha senso, ed è la ragione per cui un arco
 * rifiutato da `canConnect` non è un arco impossibile: è un arco che non può essere quel verso lì.
 */
import { CANVAS_EDGE_KINDS, type CanvasEdgeKind } from '$lib/canvas-edges';
import { canConnect, type CanvasNode, type Medium, type Verdict } from './graph';

/** Cosa c'è dietro una tile, quando il chiamante lo sa. Null vale «non lo so», mai «non si può». */
export type NodeLookup = (itemId: string) => CanvasNode | null;

/**
 * Da quel che una pagina ha già in mano — un nodo che produce, o una pagina incorporata — al
 * vocabolario del modello. Una funzione e non due righe nel chiamante: le superfici che mettono
 * nodi sulla tela sono più d'una, e ognuna che riscrivesse «medium come kind» direbbe un'altra
 * cosa alla prima aggiunta. Il medium ASSENTE è la pagina incorporata, che di medium non ne
 * sceglie mai uno.
 */
export function tileNode(n: {
  id: string;
  medium?: Medium | null;
  model?: string | null;
}): CanvasNode {
  return { id: n.id, kind: n.medium ?? 'iframe', model: n.model ?? null };
}

/** Il verso che si salva quando nessuno sceglie: il gesto disegna una derivazione. */
export const DEFAULT_EDGE_KIND: CanvasEdgeKind = 'derives_from';

/** I versi che alimentano, cioè quelli che `canConnect` governa. */
const FEEDING_KINDS: readonly CanvasEdgeKind[] = CANVAS_EDGE_KINDS.filter(
  (kind) => kind !== 'groups_with'
);

export function verdictBetween(at: NodeLookup, source: string, target: string): Verdict {
  if (source === target) {
    return { ok: false, why: 'un nodo non si collega a se stesso' };
  }

  const from = at(source);
  const to = at(target);
  if (!from || !to) return { ok: true };

  return canConnect(from, to);
}

/**
 * I versi che si possono proporre su questa coppia, nell'ordine in cui si mostrano. Mai vuoto:
 * due cose sulla stessa tela possono sempre stare insieme.
 */
export function edgeKindsFor(at: NodeLookup, source: string, target: string): CanvasEdgeKind[] {
  if (source === target) return [];

  return verdictBetween(at, source, target).ok
    ? [...CANVAS_EDGE_KINDS]
    : CANVAS_EDGE_KINDS.filter((kind) => !FEEDING_KINDS.includes(kind));
}
