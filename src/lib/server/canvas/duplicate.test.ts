import { describe, expect, it } from 'vitest';
import { duplicateNodes } from './duplicate';
import { fakeDb } from '$lib/server/db/fake-db';

const scope = { orgId: 'org', projectId: 'project', canvasId: 'canvas' };

describe('duplicare una selezione', () => {
  it('crea un nodo nuovo per ogni tile scelta, con lo stesso tipo e contenuto', async () => {
    const fake = fakeDb({
      nodes: [
        { id: 'a', canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 10, y: 20, z: 0, width: null, height: null, data: { prompt: 'ciao' }, version: 1 }
      ],
      nodes_connections: []
    });

    const out = await duplicateNodes(fake.db, { ...scope, nodeIds: ['a'], actor: { kind: 'user', id: 'user' } });

    expect(out.nodes).toHaveLength(1);
    const insert = fake.calls.find((c) => c.table === 'nodes' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ type: 'text', data: { prompt: 'ciao' } });
  });

  it('sposta ogni copia del passo dato, non la lascia sopra l’originale', async () => {
    const fake = fakeDb({
      nodes: [
        { id: 'a', canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 10, y: 20, z: 0, width: null, height: null, data: {}, version: 1 }
      ],
      nodes_connections: []
    });

    await duplicateNodes(fake.db, { ...scope, nodeIds: ['a'], actor: { kind: 'user', id: 'user' } });

    const insert = fake.calls.find((c) => c.table === 'nodes' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ x: 42, y: 52 });
  });

  it('non prova a collegare un nodo scelto a uno fuori dalla selezione', async () => {
    const fake = fakeDb({
      nodes: [
        { id: 'a', canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: {}, version: 1 },
        { id: 'b', canvas_id: 'canvas', project_id: 'project', type: 'image', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: {}, version: 1 }
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: 'canvas', source_node_id: 'a', target_node_id: 'b', source_handle: 'text', target_handle: 'text' }
      ]
    });

    await duplicateNodes(fake.db, { ...scope, nodeIds: ['a'], actor: { kind: 'user', id: 'user' } });

    expect(fake.calls.some((c) => c.table === 'nodes_connections' && c.op === 'insert')).toBe(false);
  });

  it('senza id da duplicare non scrive niente', async () => {
    const fake = fakeDb({ nodes: [], nodes_connections: [] });

    const out = await duplicateNodes(fake.db, { ...scope, nodeIds: [], actor: { kind: 'user', id: 'user' } });

    expect(out.nodes).toEqual([]);
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });
});
