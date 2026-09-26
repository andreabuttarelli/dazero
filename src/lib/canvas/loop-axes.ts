/**
 * DAI FILI `iterate` DI UN NODO AGLI ASSI CHE `loop-plan.ts` COMBINA — pura logica, nessun
 * database: prende nodi e archi già letti (la stessa forma di `upstream-inputs.ts`) e dice quali
 * fili sono assi, quanti valori porta ciascuno, e QUALE INDICE 1-BASED va passato a
 * `upstreamInputsFor`'s `iterateSelection` per l'iterazione N — la domanda che l'esecutore
 * (`loop.ts`, con un `db`) fa una volta per combinazione.
 *
 * SOLO UNA `list` PUÒ ESSERE UN ASSE, oggi: è l'unico nodo che porta più valori con un ordine
 * dichiarato (`data.items`). Un filo `iterate` la cui sorgente non è una `list` non è un asse —
 * lo dice `axesFrom` con lo stesso `rejected` che il resolver usa per un input che non alimenta
 * niente, non un errore che ferma l'intero piano.
 */
import type { LoopAxis } from './loop-plan';

export type LoopSourceNode = { id: string; type: string; itemCount: number };
export type LoopEdge = { sourceNodeId: string; targetNodeId: string; mode: 'fixed' | 'iterate' };

export type AxesResult = { axes: LoopAxis[]; rejected: { nodeId: string; why: string }[] };

/**
 * Gli assi di UN nodo bersaglio: un `LoopAxis` per ogni filo `iterate` la cui sorgente è una
 * `list` con almeno un item — l'ordine è quello degli archi (`edges`), deterministico perché
 * `upstream-inputs.ts` già impone lo stesso ordine a monte.
 */
export function axesFrom(targetId: string, edges: LoopEdge[], nodesById: Map<string, LoopSourceNode>): AxesResult {
  const iterateEdges = edges.filter((e) => e.targetNodeId === targetId && e.mode === 'iterate');

  const axes: LoopAxis[] = [];
  const rejected: AxesResult['rejected'] = [];

  for (const edge of iterateEdges) {
    const source = nodesById.get(edge.sourceNodeId);
    if (!source) continue;

    if (source.type !== 'list') {
      rejected.push({ nodeId: source.id, why: 'solo un nodo list può essere un asse di loop' });
      continue;
    }
    if (source.itemCount === 0) {
      rejected.push({ nodeId: source.id, why: 'lista vuota: niente da iterare' });
      continue;
    }

    axes.push({ nodeId: source.id, values: Array.from({ length: source.itemCount }, (_, i) => String(i + 1)) });
  }

  return { axes, rejected };
}

/**
 * UNA COMBINAZIONE PIANIFICATA → LA MAPPA `iterateSelection` per quell'iterazione: ogni asse porta
 * già l'INDICE 1-based come valore (`axesFrom` sopra li genera così apposta, "1", "2", …), quindi
 * qui basta convertirli a numero — nessuna seconda ricerca dentro la lista.
 */
export function iterateSelectionFor(combination: Record<string, string>): Record<string, number> {
  return Object.fromEntries(Object.entries(combination).map(([nodeId, value]) => [nodeId, Number(value)]));
}

export type LoopAffordance = { visible: boolean; combinationCount: number };

/**
 * SE IL BOTTONE LOOP SI VEDE, e con quante combinazioni — la stessa domanda che `axesFrom` +
 * `planCombinations` (cartesiano) rispondono per eseguire un loop, qui risposta prima di girare
 * niente. Un asse con un solo valore non è un asse utile: un loop di 1 non combina niente, quindi
 * resta nascosto come nessun asse — la soglia è ">=2 valori", non ">=1 filo iterate".
 */
export function loopAffordance(targetId: string, edges: LoopEdge[], nodesById: Map<string, LoopSourceNode>): LoopAffordance {
  const { axes } = axesFrom(targetId, edges, nodesById);
  if (!axes.length) return { visible: false, combinationCount: 0 };

  const combinationCount = axes.reduce((n, axis) => n * axis.values.length, 1);
  return { visible: combinationCount >= 2, combinationCount };
}
