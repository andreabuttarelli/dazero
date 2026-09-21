import { describe, expect, it } from 'vitest';
import {
  createConnection,
  createNode,
  deleteConnection,
  listNodes,
  moveNode,
  writeNodeData
} from '$lib/server/repos/canvas';
import type { Db } from '$lib/server/db/client';

/**
 * Il doppio del client: registra le chiamate e restituisce le righe che gli si danno, così il
 * test guarda la QUERY che parte — che è dove sta la tenancy — e non solo il valore che torna.
 */
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

function fakeDb(rows: Record<string, unknown[]>) {
  const calls: Call[] = [];

  const builder = (table: string, op: string, payload?: unknown) => {
    const call: Call = { table, op, payload, filters: [] };
    calls.push(call);

    const chain = {
      eq(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      is(column: string, value: unknown) {
        call.filters.push([column, value]);
        return chain;
      },
      order() {
        return chain;
      },
      select() {
        return chain;
      },
      single: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null })
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

const filtersOf = (calls: Call[], op: string) =>
  Object.fromEntries(calls.find((c) => c.op === op)!.filters);

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
    const { db, calls } = fakeDb({ nodes_connections: [{ id: 'c1', org_id: ORG, canvas_id: CANVAS, source_node_id: NODE, target_node_id: NODE, source_handle: null, target_handle: null, created_at: '2026-09-21T00:00:00Z' }] });

    await createConnection(db, {
      orgId: ORG,
      canvasId: CANVAS,
      sourceNodeId: NODE,
      targetNodeId: NODE,
      targetHandle: 'prompt'
    });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ org_id: ORG, canvas_id: CANVAS });
  });

  it('un arco si cancella dentro la sua org', async () => {
    const { db, calls } = fakeDb({ nodes_connections: [] });

    await deleteConnection(db, { orgId: ORG, connectionId: 'c1' });

    expect(filtersOf(calls, 'delete')).toMatchObject({ id: 'c1', org_id: ORG });
  });
});
