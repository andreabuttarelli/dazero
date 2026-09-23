import { describe, expect, it } from 'vitest';
import {
  createConnection,
  createNode,
  deleteConnection,
  deleteNode,
  listNodes,
  listNodesByIds,
  moveNode,
  setConnectionMode,
  writeNodeData
} from '$lib/server/repos/canvas';
import type { Db } from '$lib/server/db/client';

/**
 * Il doppio del client: registra le chiamate e restituisce le righe che gli si danno, così il
 * test guarda la QUERY che parte — che è dove sta la tenancy — e non solo il valore che torna.
 *
 * `canvas_events` porta sempre una riga: ogni scrittura strutturale (`createNode`, `writeNodeData`,
 * `deleteConnection`, …) registra un evento subito dopo, e senza una riga da restituire quella
 * `insert().select().single()` tornerebbe `null` e romperebbe la chiamata vera che sta testando.
 */
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

/**
 * `updateRows` separa cosa un `UPDATE ... RETURNING` porta da cosa una `SELECT` precedente vede:
 * `writeNodeData`/`deleteNode` leggono la riga PRIMA di scriverla (per `before` sull'evento) e poi
 * scrivono la NUOVA — senza questa distinzione le due letture vedrebbero la stessa riga e
 * `before`/`after` risulterebbero identici, un difetto del doppio, non del codice vero.
 */
function fakeDb(rows: Record<string, unknown[]>, updateRows?: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const seeded: Record<string, unknown[]> = { canvas_events: [eventRow], ...rows };
  const written: Record<string, unknown[]> = updateRows ? { canvas_events: [eventRow], ...updateRows } : seeded;

  const builder = (table: string, op: string, payload?: unknown) => {
    const call: Call = { table, op, payload, filters: [] };
    calls.push(call);
    const rowsFor = op === 'update' ? written : seeded;

    const chain = {
      eq(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      is(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      in(column: string, values: unknown) {
        call.filters.push([column, values]);
        return chain;
      },
      order() {
        return chain;
      },
      select() {
        return chain;
      },
      single: async () => ({ data: (rowsFor[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (rowsFor[table] ?? [])[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rowsFor[table] ?? [], error: null })
    };
    return chain;
  };

  const db = {
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      insert: (payload: unknown) => builder(table, 'insert', payload),
      update: (payload: unknown) => builder(table, 'update', payload),
      delete: () => builder(table, 'delete')
    })
  } as unknown as Db;

  return { db, calls };
}

const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '22222222-2222-2222-2222-222222222222';
const PROJECT = '33333333-3333-3333-3333-333333333333';
const CANVAS = '44444444-4444-4444-4444-444444444444';
const NODE = '55555555-5555-5555-5555-555555555555';

const nodeRow = {
  id: NODE,
  org_id: ORG,
  project_id: PROJECT,
  canvas_id: CANVAS,
  type: 'text',
  display_name: null,
  x: 10,
  y: 20,
  z: 0,
  width: null,
  height: null,
  data: { prompt: 'ciao' },
  version: 3,
  deleted_at: null,
  created_at: '2026-09-21T00:00:00Z',
  updated_at: '2026-09-21T00:00:00Z'
};

const eventRow = {
  id: 1,
  org_id: ORG,
  canvas_id: CANVAS,
  kind: 'node.update',
  node_id: NODE,
  edge_id: null,
  before: null,
  after: null,
  actor_kind: 'system',
  actor_id: null,
  agent_key: null,
  created_at: '2026-09-21T00:00:00Z'
};

const filtersOf = (calls: Call[], op: string, table?: string) =>
  Object.fromEntries(calls.find((c) => c.op === op && (!table || c.table === table))!.filters);

describe('la lettura non esce dall org', () => {
  it('lista i nodi di un canvas con org_id accanto', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await listNodes(db, { orgId: ORG, canvasId: CANVAS });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, canvas_id: CANVAS });
  });

  it('esclude i nodi cancellati', async () => {
    const { db, calls } = fakeDb({ nodes: [] });

    await listNodes(db, { orgId: ORG, canvasId: CANVAS });

    expect(filtersOf(calls, 'select')).toMatchObject({ deleted_at: null });
  });

  it('restituisce una forma di dominio, non la riga', async () => {
    const { db } = fakeDb({ nodes: [nodeRow] });

    const [node] = await listNodes(db, { orgId: ORG, canvasId: CANVAS });

    expect(node).toEqual({
      id: NODE,
      canvasId: CANVAS,
      projectId: PROJECT,
      type: 'text',
      displayName: null,
      position: { x: 10, y: 20, z: 0 },
      size: { width: null, height: null },
      data: { prompt: 'ciao' },
      version: 3
    });
  });
});

describe('un asset risale al nodo che lo ha generato', () => {
  it('scopa la ricerca per org e per l elenco di id', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await listNodesByIds(db, { orgId: ORG, nodeIds: [NODE] });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, id: [NODE] });
  });

  it('un elenco vuoto non interroga il database', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    const found = await listNodesByIds(db, { orgId: ORG, nodeIds: [] });

    expect(found).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('la posizione è last-write-wins', () => {
  it('non chiede la versione attesa', async () => {
    const { db, calls } = fakeDb({ nodes: [{ ...nodeRow, x: 99, y: 77 }] });

    await moveNode(db, { orgId: ORG, nodeId: NODE, x: 99, y: 77 });

    expect(filtersOf(calls, 'update')).not.toHaveProperty('version');
  });

  it('scopa comunque sull org', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await moveNode(db, { orgId: ORG, nodeId: NODE, x: 1, y: 2 });

    expect(filtersOf(calls, 'update')).toMatchObject({ id: NODE, org_id: ORG });
  });

  it('non tocca la versione: chi scrive il contenuto non perde il suo confronto', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await moveNode(db, { orgId: ORG, nodeId: NODE, x: 1, y: 2 });

    expect(calls.find((c) => c.op === 'update')!.payload).not.toHaveProperty('version');
  });
});

describe('il contenuto usa la concorrenza ottimistica', () => {
  it('filtra sulla versione attesa e la incrementa', async () => {
    const { db, calls } = fakeDb({ nodes: [{ ...nodeRow, version: 4 }] });

    await writeNodeData(db, { orgId: ORG, nodeId: NODE, data: { prompt: 'nuovo' }, expectedVersion: 3 });

    const update = calls.find((c) => c.op === 'update')!;
    expect(Object.fromEntries(update.filters)).toMatchObject({ id: NODE, org_id: ORG, version: 3 });
    expect(update.payload).toMatchObject({ version: 4 });
  });

  it('zero righe è un conflitto, non un successo silenzioso', async () => {
    const { db } = fakeDb({ nodes: [] });

    const result = await writeNodeData(db, {
      orgId: ORG,
      nodeId: NODE,
      data: { prompt: 'nuovo' },
      expectedVersion: 3
    });

    expect(result).toEqual({ outcome: 'conflict' });
  });

  it('la riga scritta torna con la versione nuova', async () => {
    const { db } = fakeDb({ nodes: [{ ...nodeRow, version: 4, data: { prompt: 'nuovo' } }] });

    const result = await writeNodeData(db, {
      orgId: ORG,
      nodeId: NODE,
      data: { prompt: 'nuovo' },
      expectedVersion: 3
    });

    expect(result).toEqual({ outcome: 'written', node: expect.objectContaining({ version: 4 }) });
  });
});

describe('la creazione porta sempre l org', () => {
  it('un nodo nasce con org, progetto e canvas', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await createNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      type: 'text',
      x: 10,
      y: 20
    });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({
      org_id: ORG,
      project_id: PROJECT,
      canvas_id: CANVAS
    });
  });

  it('un org estraneo non entra dal payload: lo porta chi chiama, e il test lo vede', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await createNode(db, {
      orgId: OTHER_ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      type: 'text',
      x: 0,
      y: 0
    });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ org_id: OTHER_ORG });
  });

  it('un arco nasce sull org e sul canvas', async () => {
    const { db, calls } = fakeDb({ nodes_connections: [{ id: 'c1', org_id: ORG, canvas_id: CANVAS, source_node_id: NODE, target_node_id: NODE, source_handle: null, target_handle: null, mode: 'fixed', created_at: '2026-09-21T00:00:00Z' }] });

    await createConnection(db, {
      orgId: ORG,
      canvasId: CANVAS,
      sourceNodeId: NODE,
      targetNodeId: NODE,
      targetHandle: 'prompt'
    });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ org_id: ORG, canvas_id: CANVAS });
  });

  it.skip('un arco nasce fisso di default, senza che chi lo crea debba dirlo [in attesa di 20260923_loop_nodes.sql]', async () => {
    const { db, calls } = fakeDb({ nodes_connections: [{ id: 'c1', org_id: ORG, canvas_id: CANVAS, source_node_id: NODE, target_node_id: NODE, source_handle: null, target_handle: null, mode: 'fixed', created_at: '2026-09-21T00:00:00Z' }] });

    await createConnection(db, { orgId: ORG, canvasId: CANVAS, sourceNodeId: NODE, targetNodeId: NODE });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ mode: 'fixed' });
  });

  it.skip('un arco può nascere iterate: quel filo è un asse del loop [in attesa di 20260923_loop_nodes.sql]', async () => {
    const { db, calls } = fakeDb({ nodes_connections: [{ id: 'c1', org_id: ORG, canvas_id: CANVAS, source_node_id: NODE, target_node_id: NODE, source_handle: null, target_handle: null, mode: 'iterate', created_at: '2026-09-21T00:00:00Z' }] });

    await createConnection(db, { orgId: ORG, canvasId: CANVAS, sourceNodeId: NODE, targetNodeId: NODE, mode: 'iterate' });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ mode: 'iterate' });
  });

  it('setConnectionMode cambia fixed/iterate dentro la propria org', async () => {
    const connectionRow = { id: 'c1', org_id: ORG, canvas_id: CANVAS, source_node_id: NODE, target_node_id: NODE, source_handle: null, target_handle: null, mode: 'iterate' };
    const { db, calls } = fakeDb({ nodes_connections: [connectionRow] }, { nodes_connections: [connectionRow] });

    const out = await setConnectionMode(db, { orgId: ORG, connectionId: 'c1', mode: 'iterate' });

    expect(out?.mode).toBe('iterate');
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.payload).toMatchObject({ mode: 'iterate' });
    expect(update.filters).toContainEqual(['org_id', ORG]);
  });

  it('un arco si cancella (soft) dentro la sua org', async () => {
    const connectionRow = {
      id: 'c1',
      org_id: ORG,
      canvas_id: CANVAS,
      source_node_id: NODE,
      target_node_id: NODE,
      source_handle: null,
      target_handle: null
    };
    const { db, calls } = fakeDb({ nodes_connections: [connectionRow] });

    await deleteConnection(db, { orgId: ORG, connectionId: 'c1' });

    const update = calls.find((c) => c.op === 'update' && c.table === 'nodes_connections')!;
    expect(Object.fromEntries(update.filters)).toMatchObject({ id: 'c1', org_id: ORG });
    expect(update.payload).toHaveProperty('deleted_at');
  });

  it('un arco non trovato non scrive niente, né la cancellazione né un evento', async () => {
    const { db, calls } = fakeDb({ nodes_connections: [] });

    await deleteConnection(db, { orgId: ORG, connectionId: 'c1' });

    expect(calls.filter((c) => c.op === 'update' || c.op === 'insert')).toEqual([]);
  });
});

describe('ogni gesto strutturale scrive canvas_events', () => {
  it('node.create porta after con type/posizione/data e l org', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await createNode(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, type: 'text', x: 10, y: 20 });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({
      org_id: ORG,
      canvas_id: CANVAS,
      kind: 'node.create',
      node_id: NODE
    });
  });

  it('node.update porta before E after, non solo il nuovo valore', async () => {
    const { db, calls } = fakeDb(
      { nodes: [nodeRow] },
      { nodes: [{ ...nodeRow, version: 4, data: { prompt: 'nuovo' } }] }
    );

    await writeNodeData(db, { orgId: ORG, nodeId: NODE, data: { prompt: 'nuovo' }, expectedVersion: 3 });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({
      kind: 'node.update',
      node_id: NODE,
      before: { data: { prompt: 'ciao' } },
      after: { data: { prompt: 'nuovo' } }
    });
  });

  it('un conflitto di versione non scrive nessun evento: niente da raccontare se non si è scritto', async () => {
    const { db, calls } = fakeDb({ nodes: [] });

    await writeNodeData(db, { orgId: ORG, nodeId: NODE, data: { prompt: 'nuovo' }, expectedVersion: 3 });

    expect(calls.some((c) => c.table === 'canvas_events')).toBe(false);
  });

  it('node.delete porta before con lo stato intero, quello che restore_node dovrà rimettere', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await deleteNode(db, { orgId: ORG, nodeId: NODE });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({
      kind: 'node.delete',
      node_id: NODE,
      before: { type: 'text', position: { x: 10, y: 20, z: 0 }, data: { prompt: 'ciao' }, version: 3 }
    });
  });

  it('un nodo già sparito non scrive né la cancellazione né un evento', async () => {
    const { db, calls } = fakeDb({ nodes: [] });

    await deleteNode(db, { orgId: ORG, nodeId: NODE });

    expect(calls.filter((c) => c.op === 'update' || c.table === 'canvas_events')).toEqual([]);
  });

  it('edge.create porta i due capi dell arco', async () => {
    const connectionRow = {
      id: 'c1',
      org_id: ORG,
      canvas_id: CANVAS,
      source_node_id: NODE,
      target_node_id: NODE,
      source_handle: null,
      target_handle: 'prompt'
    };
    const { db, calls } = fakeDb({ nodes_connections: [connectionRow] });

    await createConnection(db, { orgId: ORG, canvasId: CANVAS, sourceNodeId: NODE, targetNodeId: NODE, targetHandle: 'prompt' });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({
      kind: 'edge.create',
      edge_id: 'c1',
      after: { sourceNodeId: NODE, targetNodeId: NODE, targetHandle: 'prompt' }
    });
  });

  it('edge.delete porta i due capi in before, per poterlo ricreare', async () => {
    const connectionRow = {
      id: 'c1',
      org_id: ORG,
      canvas_id: CANVAS,
      source_node_id: NODE,
      target_node_id: NODE,
      source_handle: null,
      target_handle: 'prompt'
    };
    const { db, calls } = fakeDb({ nodes_connections: [connectionRow] });

    await deleteConnection(db, { orgId: ORG, connectionId: 'c1' });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({
      kind: 'edge.delete',
      edge_id: 'c1',
      before: { sourceNodeId: NODE, targetNodeId: NODE, targetHandle: 'prompt' }
    });
  });

  it('senza actor, l evento porta system — mai un null muto', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await createNode(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, type: 'text', x: 0, y: 0 });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({ actor_kind: 'system', actor_id: null });
  });

  it('con un actor agente, l evento porta la tripla intera', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });

    await createNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      type: 'text',
      x: 0,
      y: 0,
      actor: { kind: 'agent', id: 'user-1', agentKey: 'mcp:claude' }
    });

    const event = calls.find((c) => c.table === 'canvas_events' && c.op === 'insert')!;
    expect(event.payload).toMatchObject({ actor_kind: 'agent', actor_id: 'user-1', agent_key: 'mcp:claude' });
  });
});
