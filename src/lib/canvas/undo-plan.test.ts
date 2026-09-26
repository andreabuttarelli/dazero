import { describe, expect, it } from 'vitest';
import {
  inverseOf,
  checkPrecondition,
  checkGesture,
  type UndoItem,
  type Gesture,
  type CurrentNodeState,
  type CurrentEdgeState
} from './undo-plan';

const NODE = '44444444-4444-4444-4444-444444444444';
const EDGE = '55555555-5555-5555-5555-555555555555';
const OTHER_NODE = '66666666-6666-6666-6666-666666666666';

describe('inverseOf: una riga per kind, non un if sparso', () => {
  it('node.create si disfa con un soft-delete', () => {
    const item: UndoItem = { kind: 'node.create', nodeId: NODE, after: { type: 'text' } };

    expect(inverseOf(item)).toEqual({ op: 'delete_node', nodeId: NODE });
  });

  it('node.delete si disfa restituendo lo stato di prima', () => {
    const item: UndoItem = { kind: 'node.delete', nodeId: NODE, before: { x: 10, y: 20 } };

    expect(inverseOf(item)).toEqual({ op: 'restore_node', nodeId: NODE, data: { x: 10, y: 20 } });
  });

  it('node.update si disfa riscrivendo before, con la versione attesa che porta con sé', () => {
    const item: UndoItem = {
      kind: 'node.update',
      nodeId: NODE,
      before: { prompt: 'vecchio' },
      after: { prompt: 'nuovo' },
      expectedVersion: 5
    };

    expect(inverseOf(item)).toEqual({
      op: 'write_node_data',
      nodeId: NODE,
      data: { prompt: 'vecchio' },
      expectedVersion: 5
    });
  });

  it('edge.create si disfa cancellando l arco', () => {
    const item: UndoItem = { kind: 'edge.create', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE };

    expect(inverseOf(item)).toEqual({ op: 'delete_edge', edgeId: EDGE });
  });

  it('edge.delete si disfa ripristinando l arco', () => {
    const item: UndoItem = { kind: 'edge.delete', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE };

    expect(inverseOf(item)).toEqual({ op: 'restore_edge', edgeId: EDGE });
  });
});

const liveNode = (overrides: Partial<Extract<CurrentNodeState, { exists: true }>> = {}): CurrentNodeState => ({
  exists: true,
  version: 5,
  connectedBy: [],
  ...overrides
});

const goneNode: CurrentNodeState = { exists: false };
const liveEdge: CurrentEdgeState = { exists: true };
const goneEdge: CurrentEdgeState = { exists: false };

describe('checkPrecondition: le premesse che possono essere cadute mentre il gesto aspettava', () => {
  it('node.update con la stessa versione attesa passa', () => {
    const item: UndoItem = { kind: 'node.update', nodeId: NODE, before: {}, after: {}, expectedVersion: 5 };

    expect(checkPrecondition(item, { node: liveNode({ version: 5 }) })).toEqual({ outcome: 'ok' });
  });

  it('node.update: un collega ha scritto lo stesso nodo nel frattempo → stale, mai forzato', () => {
    const item: UndoItem = { kind: 'node.update', nodeId: NODE, before: {}, after: {}, expectedVersion: 5 };

    const result = checkPrecondition(item, { node: liveNode({ version: 6 }) });

    expect(result).toEqual({ outcome: 'stale', reason: 'node_changed_by_peer' });
  });

  it('node.update: il nodo è già sparito → stale, non un errore generico', () => {
    const item: UndoItem = { kind: 'node.update', nodeId: NODE, before: {}, after: {}, expectedVersion: 5 };

    expect(checkPrecondition(item, { node: goneNode })).toEqual({ outcome: 'stale', reason: 'node_deleted_by_peer' });
  });

  it('node.delete: il nodo che l inversa deve ripristinare è ancora là (soft-deleted) → ok', () => {
    const item: UndoItem = { kind: 'node.delete', nodeId: NODE, before: {} };

    expect(checkPrecondition(item, { node: liveNode() })).toEqual({ outcome: 'ok' });
  });

  it('node.delete: la riga è sparita per davvero (hard delete a cascata) → stale', () => {
    const item: UndoItem = { kind: 'node.delete', nodeId: NODE, before: {} };

    expect(checkPrecondition(item, { node: goneNode })).toEqual({ outcome: 'stale', reason: 'node_deleted_by_peer' });
  });

  it('node.create: nessuno lo ha toccato → ok, si può cancellare di nuovo', () => {
    const item: UndoItem = { kind: 'node.create', nodeId: NODE, after: {} };

    expect(checkPrecondition(item, { node: liveNode({ connectedBy: [] }) })).toEqual({ outcome: 'ok' });
  });

  it('node.create: un collega ha agganciato un arco → stale, non si cancella il lavoro altrui in silenzio', () => {
    const item: UndoItem = { kind: 'node.create', nodeId: NODE, after: {} };

    const result = checkPrecondition(item, { node: liveNode({ connectedBy: [EDGE] }) });

    expect(result).toEqual({ outcome: 'stale', reason: 'node_gained_peer_connections' });
  });

  it('node.create: il nodo è già sparito (un peer lo ha cancellato) → stale', () => {
    const item: UndoItem = { kind: 'node.create', nodeId: NODE, after: {} };

    expect(checkPrecondition(item, { node: goneNode })).toEqual({ outcome: 'stale', reason: 'node_deleted_by_peer' });
  });

  it('edge.delete: l arco che l inversa deve ripristinare non c è più → stale', () => {
    const item: UndoItem = { kind: 'edge.delete', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE };

    expect(checkPrecondition(item, { edge: goneEdge })).toEqual({ outcome: 'stale', reason: 'edge_already_gone' });
  });

  it('edge.delete: l arco è ancora là → ok', () => {
    const item: UndoItem = { kind: 'edge.delete', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE };

    expect(checkPrecondition(item, { edge: liveEdge })).toEqual({ outcome: 'ok' });
  });

  it('edge.create: l arco che l inversa deve togliere è già sparito → stale, non un errore', () => {
    const item: UndoItem = { kind: 'edge.create', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE };

    expect(checkPrecondition(item, { edge: goneEdge })).toEqual({ outcome: 'stale', reason: 'edge_already_gone' });
  });
});

describe('checkGesture: il cambio di modello che sgancia connessioni si annulla come UN unità', () => {
  it('nessun item caduto: tutte le inverse tornano, nell ordine del gesto', () => {
    const gesture: Gesture = {
      items: [
        { kind: 'node.update', nodeId: NODE, before: { model: 'old' }, after: { model: 'new' }, expectedVersion: 3 },
        { kind: 'edge.delete', edgeId: 'e1', sourceNodeId: 'a', targetNodeId: NODE },
        { kind: 'edge.delete', edgeId: 'e2', sourceNodeId: 'b', targetNodeId: NODE }
      ]
    };
    const states: Record<string, CurrentNodeState> = { [NODE]: liveNode({ version: 3 }) };

    const result = checkGesture(gesture, (item) =>
      item.kind === 'node.update' || item.kind === 'node.create' || item.kind === 'node.delete'
        ? { node: states[item.nodeId] }
        : { edge: liveEdge }
    );

    expect(result).toEqual({
      outcome: 'ok',
      writes: [
        { op: 'write_node_data', nodeId: NODE, data: { model: 'old' }, expectedVersion: 3 },
        { op: 'restore_edge', edgeId: 'e1' },
        { op: 'restore_edge', edgeId: 'e2' }
      ]
    });
  });

  it('un item caduto rifiuta l intero gesto PRIMA di scrivere qualunque cosa: mai metà applicato', () => {
    const gesture: Gesture = {
      items: [
        { kind: 'node.update', nodeId: NODE, before: { model: 'old' }, after: { model: 'new' }, expectedVersion: 3 },
        { kind: 'edge.delete', edgeId: 'e1', sourceNodeId: 'a', targetNodeId: NODE }
      ]
    };
    // Il nodo è stato riscritto da un collega nel frattempo: versione avanzata a 4.
    const states: Record<string, CurrentNodeState> = { [NODE]: liveNode({ version: 4 }) };

    const result = checkGesture(gesture, (item) =>
      item.kind === 'node.update' ? { node: states[item.nodeId] } : { edge: liveEdge }
    );

    expect(result).toEqual({
      outcome: 'stale',
      reason: 'node_changed_by_peer',
      item: gesture.items[0]
    });
  });

  it('il secondo item di un gesto può essere quello caduto, e il gesto resta rifiutato per intero', () => {
    const gesture: Gesture = {
      items: [
        { kind: 'node.update', nodeId: NODE, before: { model: 'old' }, after: { model: 'new' }, expectedVersion: 3 },
        { kind: 'edge.delete', edgeId: 'e1', sourceNodeId: 'a', targetNodeId: NODE }
      ]
    };
    const states: Record<string, CurrentNodeState> = { [NODE]: liveNode({ version: 3 }) };

    const result = checkGesture(gesture, (item) =>
      item.kind === 'node.update' ? { node: states[item.nodeId] } : { edge: goneEdge }
    );

    expect(result).toEqual({ outcome: 'stale', reason: 'edge_already_gone', item: gesture.items[1] });
  });

  it('un gesto da un item solo si comporta come checkPrecondition', () => {
    const gesture: Gesture = { items: [{ kind: 'node.create', nodeId: NODE, after: {} }] };

    const result = checkGesture(gesture, () => ({ node: liveNode({ connectedBy: [] }) }));

    expect(result).toEqual({ outcome: 'ok', writes: [{ op: 'delete_node', nodeId: NODE }] });
  });
});
