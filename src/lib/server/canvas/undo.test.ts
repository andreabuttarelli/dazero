import { describe, expect, it } from 'vitest';
import { actions } from '../../../routes/p/[projectId]/c/[canvasId]/+page.server';
import { fakeDb } from '$lib/server/db/fake-db';

function event(fields: Record<string, string>, rows: Record<string, unknown[]> = {}) {
  const fake = fakeDb({
    orgs_members: [{ role: 'owner', orgs: { id: 'org', name: 'Org', slug: 'org' } }],
    canvases: [{ id: 'canvas', project_id: 'project', name: 'Canvas', viewport: null }],
    nodes: [],
    nodes_connections: [],
    ...rows
  });
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  return {
    ...fake,
    request: new Request('http://localhost/c/canvas', { method: 'POST', body }),
    params: { canvasId: 'canvas' },
    locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }), db: async () => fake.db }
  };
}

const NODE = '44444444-4444-4444-4444-444444444444';
const EDGE = '55555555-5555-5555-5555-555555555555';
const OTHER_NODE = '66666666-6666-6666-6666-666666666666';

describe('undo action: gesture input', () => {
  it('rejects a request with no items, before touching the database', async () => {
    const input = event({ items: '[]' });
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'update' || call.op === 'insert')).toBe(false);
  });

  it('rejects unreadable json, before touching the database', async () => {
    const input = event({ items: 'not json' });
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'update' || call.op === 'insert')).toBe(false);
  });
});

describe('undo action: node.create is undone by a soft-delete', () => {
  it('deletes the node that a create gesture made', async () => {
    const input = event(
      { items: JSON.stringify([{ kind: 'node.create', nodeId: NODE, after: { type: 'text' } }]) },
      {
        nodes: [
          { id: NODE, canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: {}, version: 1 }
        ]
      }
    );
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ outcome: 'undone' });
    const update = input.calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(update?.payload).toMatchObject({ deleted_at: expect.any(String) });
  });
});

describe('undo action: node.delete is undone by a restore', () => {
  it('restores the node a delete gesture soft-deleted', async () => {
    const input = event(
      {
        items: JSON.stringify([
          {
            kind: 'node.delete',
            nodeId: NODE,
            before: { type: 'text', position: { x: 1, y: 2, z: 0 }, size: { width: null, height: null }, data: { prompt: 'ciao' }, version: 1 }
          }
        ])
      },
      {
        nodes: [
          { id: NODE, canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 1, y: 2, z: 0, width: null, height: null, data: { prompt: 'ciao' }, version: 1 }
        ]
      }
    );
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ outcome: 'undone' });
    const update = input.calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(update?.payload).toMatchObject({ deleted_at: null, data: { prompt: 'ciao' } });
  });
});

describe('undo action: node.update is undone by writing before back, with the expected version', () => {
  it('writes the previous data through writeNodeData, expecting the version the gesture recorded', async () => {
    const input = event(
      {
        items: JSON.stringify([
          {
            kind: 'node.update',
            nodeId: NODE,
            before: { data: { prompt: 'vecchio' } },
            after: { data: { prompt: 'nuovo' } },
            expectedVersion: 3
          }
        ])
      },
      {
        nodes: [
          { id: NODE, canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: { prompt: 'nuovo' }, version: 3 }
        ]
      }
    );
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ outcome: 'undone' });
    const update = input.calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(update?.payload).toMatchObject({ data: { prompt: 'vecchio' }, version: 4 });
  });

  it('a model change that dropped wires restores the model AND the wires, as one gesture', async () => {
    const input = event(
      {
        items: JSON.stringify([
          {
            kind: 'node.update',
            nodeId: NODE,
            before: { data: { model: 'old-model' } },
            after: { data: { model: 'new-model' } },
            expectedVersion: 2
          },
          { kind: 'edge.delete', edgeId: EDGE, sourceNodeId: OTHER_NODE, targetNodeId: NODE }
        ])
      },
      {
        nodes: [
          { id: NODE, canvas_id: 'canvas', project_id: 'project', type: 'image', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: { model: 'new-model' }, version: 2 }
        ],
        nodes_connections: [
          { id: EDGE, canvas_id: 'canvas', source_node_id: OTHER_NODE, target_node_id: NODE, source_handle: null, target_handle: null }
        ]
      }
    );
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ outcome: 'undone' });
    expect(input.calls.some((c) => c.table === 'nodes' && c.op === 'update')).toBe(true);
    expect(input.calls.some((c) => c.table === 'nodes_connections' && c.op === 'update')).toBe(true);
  });
});

describe('undo action: refuses instead of clobbering a peer change', () => {
  it('refuses a node.update whose expected version no longer matches, with a readable reason', async () => {
    const input = event(
      {
        items: JSON.stringify([
          {
            kind: 'node.update',
            nodeId: NODE,
            before: { data: { prompt: 'vecchio' } },
            after: { data: { prompt: 'nuovo' } },
            expectedVersion: 3
          }
        ])
      },
      {
        nodes: [
          // Un collega ha scritto dopo: la versione fresca è 4, non più 3.
          { id: NODE, canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: { prompt: 'di un altro' }, version: 4 }
        ]
      }
    );
    const result = (await actions.undo(input as never)) as unknown as { data: { reason: string } };
    expect(result).toMatchObject({ status: 409, data: { reason: 'node_changed_by_peer' } });
    expect(input.calls.some((c) => c.table === 'nodes' && c.op === 'update')).toBe(false);
  });

  it('refuses a node.delete undo when the node is already gone', async () => {
    const input = event({
      items: JSON.stringify([
        { kind: 'node.delete', nodeId: NODE, before: { type: 'text', position: { x: 0, y: 0, z: 0 }, size: { width: null, height: null }, data: {}, version: 1 } }
      ])
    });
    const result = (await actions.undo(input as never)) as unknown as { data: { reason: string } };
    expect(result).toMatchObject({ status: 409, data: { reason: 'node_deleted_by_peer' } });
  });
});

describe('undo action: edge.create/edge.delete', () => {
  it('deletes the edge a connect gesture made', async () => {
    const input = event(
      { items: JSON.stringify([{ kind: 'edge.create', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE }]) },
      { nodes_connections: [{ id: EDGE, canvas_id: 'canvas', source_node_id: NODE, target_node_id: OTHER_NODE, source_handle: null, target_handle: null }] }
    );
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ outcome: 'undone' });
    const update = input.calls.find((c) => c.table === 'nodes_connections' && c.op === 'update');
    expect(update?.payload).toMatchObject({ deleted_at: expect.any(String) });
  });

  it('restores the edge a disconnect gesture soft-deleted', async () => {
    const input = event(
      { items: JSON.stringify([{ kind: 'edge.delete', edgeId: EDGE, sourceNodeId: NODE, targetNodeId: OTHER_NODE }]) },
      { nodes_connections: [{ id: EDGE, canvas_id: 'canvas', source_node_id: NODE, target_node_id: OTHER_NODE, source_handle: null, target_handle: null }] }
    );
    const result = await actions.undo(input as never);
    expect(result).toMatchObject({ outcome: 'undone' });
    const update = input.calls.find((c) => c.table === 'nodes_connections' && c.op === 'update');
    expect(update?.payload).toMatchObject({ deleted_at: null });
  });
});
