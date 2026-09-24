import { describe, expect, it } from 'vitest';
import { checkMoveGesture, inverseMoveGesture, type MoveGesture } from './move-gesture';

const gesture = (items: MoveGesture['items']): MoveGesture => ({ kind: 'move', items });

describe('checkMoveGesture: vale ancora riportare questi nodi dov\'erano?', () => {
  it('ok quando la posizione attuale è quella che il gesto ha lasciato', () => {
    const g = gesture([{ nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } }]);
    const result = checkMoveGesture(g, () => ({ x: 10, y: 10 }));
    expect(result).toEqual({ outcome: 'ok' });
  });

  it('stale quando un collega ha spostato lo stesso nodo nel frattempo', () => {
    const g = gesture([{ nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } }]);
    // Un peer l'ha spostato altrove: la posizione fresca non è più quella che il gesto ricorda.
    const result = checkMoveGesture(g, () => ({ x: 99, y: 99 }));
    expect(result).toEqual({ outcome: 'stale', reason: 'node_moved_by_peer' });
  });

  it('stale quando il nodo non c\'è più (un collega l\'ha cancellato)', () => {
    const g = gesture([{ nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } }]);
    const result = checkMoveGesture(g, () => null);
    expect(result).toEqual({ outcome: 'stale', reason: 'node_deleted_by_peer' });
  });

  it('un gesto multi-nodo si rifiuta INTERO se anche un solo nodo è caduto', () => {
    const g = gesture([
      { nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } },
      { nodeId: 'b', before: { x: 5, y: 5 }, after: { x: 15, y: 15 } }
    ]);
    const current = (nodeId: string) => (nodeId === 'a' ? { x: 10, y: 10 } : { x: 99, y: 99 });
    const result = checkMoveGesture(g, current);
    expect(result).toEqual({ outcome: 'stale', reason: 'node_moved_by_peer' });
  });

  it('un gesto multi-nodo ok riporta TUTTI i nodi a before', () => {
    const g = gesture([
      { nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } },
      { nodeId: 'b', before: { x: 5, y: 5 }, after: { x: 15, y: 15 } }
    ]);
    const current = (nodeId: string) => (nodeId === 'a' ? { x: 10, y: 10 } : { x: 15, y: 15 });
    expect(checkMoveGesture(g, current)).toEqual({ outcome: 'ok' });
  });
});

describe('inverseMoveGesture: il redo è lo stesso gesto con before/after scambiati', () => {
  it('scambia before e after su ogni nodo del gesto', () => {
    const g = gesture([
      { nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } },
      { nodeId: 'b', before: { x: 5, y: 5 }, after: { x: 15, y: 15 } }
    ]);

    expect(inverseMoveGesture(g)).toEqual(
      gesture([
        { nodeId: 'a', before: { x: 10, y: 10 }, after: { x: 0, y: 0 } },
        { nodeId: 'b', before: { x: 15, y: 15 }, after: { x: 5, y: 5 } }
      ])
    );
  });

  it('applicata due volte torna al gesto di partenza', () => {
    const g = gesture([{ nodeId: 'a', before: { x: 0, y: 0 }, after: { x: 10, y: 10 } }]);
    expect(inverseMoveGesture(inverseMoveGesture(g))).toEqual(g);
  });
});
