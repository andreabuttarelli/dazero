import { describe, expect, it } from 'vitest';
import { axesFrom, iterateSelectionFor, type LoopEdge, type LoopSourceNode } from './loop-axes';

const nodesById = (nodes: LoopSourceNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe('axesFrom — solo i fili iterate contano, e solo verso una list', () => {
  it('nessun filo iterate: nessun asse', () => {
    const edges: LoopEdge[] = [{ sourceNodeId: 'l1', targetNodeId: 'gen', mode: 'fixed' }];
    const out = axesFrom('gen', edges, nodesById([{ id: 'l1', type: 'list', itemCount: 3 }]));
    expect(out.axes).toEqual([]);
    expect(out.rejected).toEqual([]);
  });

  it('un filo iterate da una list con 3 item: un asse con i valori "1".."3"', () => {
    const edges: LoopEdge[] = [{ sourceNodeId: 'l1', targetNodeId: 'gen', mode: 'iterate' }];
    const out = axesFrom('gen', edges, nodesById([{ id: 'l1', type: 'list', itemCount: 3 }]));
    expect(out.axes).toEqual([{ nodeId: 'l1', values: ['1', '2', '3'] }]);
  });

  it('due fili iterate: due assi, nell ordine degli archi', () => {
    const edges: LoopEdge[] = [
      { sourceNodeId: 'models', targetNodeId: 'gen', mode: 'iterate' },
      { sourceNodeId: 'envs', targetNodeId: 'gen', mode: 'iterate' }
    ];
    const out = axesFrom(
      'gen',
      edges,
      nodesById([{ id: 'models', type: 'list', itemCount: 10 }, { id: 'envs', type: 'list', itemCount: 10 }])
    );
    expect(out.axes.map((a) => a.nodeId)).toEqual(['models', 'envs']);
    expect(out.axes[0].values).toHaveLength(10);
  });

  it('un filo iterate la cui sorgente NON è una list si rifiuta, e lo dice', () => {
    const edges: LoopEdge[] = [{ sourceNodeId: 't1', targetNodeId: 'gen', mode: 'iterate' }];
    const out = axesFrom('gen', edges, nodesById([{ id: 't1', type: 'text', itemCount: 0 }]));
    expect(out.axes).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 't1', why: expect.stringContaining('list') }]);
  });

  it('una list vuota collegata iterate si rifiuta, non produce un asse a zero valori', () => {
    const edges: LoopEdge[] = [{ sourceNodeId: 'l1', targetNodeId: 'gen', mode: 'iterate' }];
    const out = axesFrom('gen', edges, nodesById([{ id: 'l1', type: 'list', itemCount: 0 }]));
    expect(out.axes).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: 'l1', why: expect.stringContaining('vuota') }]);
  });

  it('un filo iterate verso un ALTRO nodo non conta per questo target', () => {
    const edges: LoopEdge[] = [{ sourceNodeId: 'l1', targetNodeId: 'other', mode: 'iterate' }];
    const out = axesFrom('gen', edges, nodesById([{ id: 'l1', type: 'list', itemCount: 3 }]));
    expect(out.axes).toEqual([]);
  });
});

describe('iterateSelectionFor — la combinazione pianificata diventa una mappa di indici numerici', () => {
  it('converte ogni valore (già "1".."N") in un numero', () => {
    expect(iterateSelectionFor({ models: '3', envs: '7' })).toEqual({ models: 3, envs: 7 });
  });

  it('combinazione vuota: mappa vuota', () => {
    expect(iterateSelectionFor({})).toEqual({});
  });
});
