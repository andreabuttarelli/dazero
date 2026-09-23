import { describe, expect, it } from 'vitest';
import { actions } from '../../../routes/p/[projectId]/c/[canvasId]/+page.server';
import { fakeDb } from '$lib/server/db/fake-db';

function event(fields: Record<string, string>) {
  const fake = fakeDb({
    orgs_members: [{ role: 'owner', orgs: { id: 'org', name: 'Org', slug: 'org' } }],
    canvases: [{ id: 'canvas', project_id: 'project', name: 'Canvas', viewport: null }],
    nodes: []
  });
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) { body.set(key, value); }
  return {
    ...fake,
    request: new Request('http://localhost/c/canvas', { method: 'POST', body }),
    params: { canvasId: 'canvas' },
    locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }), db: async () => fake.db }
  };
}

describe('canvas action input', () => {
  it('does not move a node outside the open canvas', async () => {
    const input = event({ node_id: 'foreign', x: '10', y: '20' });
    expect(await actions.move(input as never)).toMatchObject({ status: 404 });
    expect(input.calls.some((call) => call.op === 'update')).toBe(false);
  });
  it('rejects non-object node content', async () => {
    const input = event({ type: 'text', x: '0', y: '0', data: 'null' });
    expect(await actions.create(input as never)).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });
  it('rejects missing coordinates without inserting a node', async () => {
    const input = event({ type: 'text', data: '{}' });
    const result = await actions.create(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });
  it('rejects data that does not match the node schema, before writing', async () => {
    const input = event({ type: 'text', x: '0', y: '0', data: '{"no_prompt": true}' });
    const result = await actions.create(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });
  it('accepts a node dragged in already filled, its data intact', async () => {
    const input = event({
      type: 'image',
      x: '0',
      y: '0',
      data: JSON.stringify({ prompt: '', assetId: 'a1', url: '/x', name: 'logo.png', mimeType: 'image/png' })
    });
    const result = await actions.create(input as never);
    expect(result).not.toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(true);
  });

  /**
   * IL GIRO REALE: `InfluencersPanel.svelte::onDragStart` costruisce lo stesso `FilledNodeDrag`
   * che `influencerDrag()` produce — `CanvasFlow.svelte::onDrop` lo passa a `createFilled`, che
   * chiama questa stessa `POST ?/create` con `type: 'influencer'` e `data: {influencer_id}`. Qui
   * si prova che l'azione VERA — non un mock del validatore — accetta quella forma esatta e la
   * scrive: la stessa `validateNodeData('influencer', ...)` che il CHECK del database impone.
   */
  it('accepts an influencer node dragged in from the panel, the same shape influencerDrag builds', async () => {
    const input = event({
      type: 'influencer',
      x: '0',
      y: '0',
      data: JSON.stringify({ influencer_id: 'inf-1' })
    });
    const result = await actions.create(input as never);
    expect(result).not.toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(true);
  });

  it('rejects an influencer node without influencer_id, before writing', async () => {
    const input = event({ type: 'influencer', x: '0', y: '0', data: '{}' });
    const result = await actions.create(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });
});

describe('batchWrite action', () => {
  function event(fields: Record<string, string>, nodes: Record<string, unknown>[] = []) {
    const fake = fakeDb({
      orgs_members: [{ role: 'owner', orgs: { id: 'org', name: 'Org', slug: 'org' } }],
      canvases: [{ id: 'canvas', project_id: 'project', name: 'Canvas', viewport: null }],
      nodes
    });
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) { body.set(key, value); }
    return {
      ...fake,
      request: new Request('http://localhost/c/canvas', { method: 'POST', body }),
      params: { canvasId: 'canvas' },
      locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }), db: async () => fake.db }
    };
  }

  it('rejects an empty batch, before writing', async () => {
    const input = event({ items: '[]' });
    const result = await actions.batchWrite(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'update')).toBe(false);
  });

  it('reports a node that does not exist on this canvas as not_found, without throwing', async () => {
    const input = event({ items: JSON.stringify([{ node_id: 'ghost', version: 1, patch: { model: 'x' } }]) });
    const result = (await actions.batchWrite(input as never)) as { results: { nodeId: string; outcome: string }[] };
    expect(result.results).toEqual([{ nodeId: 'ghost', outcome: 'not_found' }]);
  });

  it('writes every node in the batch, merging the patch onto its current data', async () => {
    const input = event(
      { items: JSON.stringify([{ node_id: 'a', version: 1, patch: { model: 'x' } }]) },
      [{ id: 'a', canvas_id: 'canvas', project_id: 'project', type: 'image', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: { prompt: 'ciao' }, version: 1 }]
    );
    const result = (await actions.batchWrite(input as never)) as { results: { nodeId: string; outcome: string }[] };
    expect(result.results).toEqual([{ nodeId: 'a', outcome: 'written', node: expect.anything() }]);
    const update = input.calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(update?.payload).toMatchObject({ data: { prompt: 'ciao', model: 'x' } });
  });
});

describe('connect action', () => {
  function event(fields: Record<string, string>) {
    const fake = fakeDb({
      orgs_members: [{ role: 'owner', orgs: { id: 'org', name: 'Org', slug: 'org' } }],
      canvases: [{ id: 'canvas', project_id: 'project', name: 'Canvas', viewport: null }],
      nodes: [
        { id: 'a', canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: {}, version: 1 },
        { id: 'b', canvas_id: 'canvas', project_id: 'project', type: 'image', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: {}, version: 1 }
      ]
    });
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) { body.set(key, value); }
    return {
      ...fake,
      request: new Request('http://localhost/c/canvas', { method: 'POST', body }),
      params: { canvasId: 'canvas' },
      locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }), db: async () => fake.db }
    };
  }

  it('writes the target_handle when given one, for wiring onto a typed port', async () => {
    const input = event({ source_node_id: 'a', target_node_id: 'b', kind: 'derives_from', target_handle: 'text' });
    await actions.connect(input as never);
    const insert = input.calls.find((c) => c.table === 'nodes_connections' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ target_handle: 'text' });
  });

  it('leaves target_handle null when none is given, same as before', async () => {
    const input = event({ source_node_id: 'a', target_node_id: 'b', kind: 'derives_from' });
    await actions.connect(input as never);
    const insert = input.calls.find((c) => c.table === 'nodes_connections' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ target_handle: null });
  });
});

describe('duplicate action', () => {
  function event(fields: Record<string, string>, nodes: Record<string, unknown>[] = []) {
    const fake = fakeDb({
      orgs_members: [{ role: 'owner', orgs: { id: 'org', name: 'Org', slug: 'org' } }],
      canvases: [{ id: 'canvas', project_id: 'project', name: 'Canvas', viewport: null }],
      nodes,
      nodes_connections: []
    });
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) { body.set(key, value); }
    return {
      ...fake,
      request: new Request('http://localhost/c/canvas', { method: 'POST', body }),
      params: { canvasId: 'canvas' },
      locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }), db: async () => fake.db }
    };
  }

  it('rejects a request with no ids, before writing', async () => {
    const input = event({ node_ids: '' });
    const result = await actions.duplicate(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('creates a copy of an existing node', async () => {
    const input = event({ node_ids: 'a' }, [
      { id: 'a', canvas_id: 'canvas', project_id: 'project', type: 'text', display_name: null, x: 0, y: 0, z: 0, width: null, height: null, data: { prompt: 'ciao' }, version: 1 }
    ]);
    const result = await actions.duplicate(input as never);
    expect(result).not.toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.table === 'nodes' && call.op === 'insert')).toBe(true);
  });
});

describe('paste action', () => {
  function event(fields: Record<string, string>) {
    const fake = fakeDb({
      orgs_members: [{ role: 'owner', orgs: { id: 'org', name: 'Org', slug: 'org' } }],
      canvases: [{ id: 'canvas', project_id: 'project', name: 'Canvas', viewport: null }],
      nodes: [],
      nodes_connections: []
    });
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) { body.set(key, value); }
    return {
      ...fake,
      request: new Request('http://localhost/c/canvas', { method: 'POST', body }),
      params: { canvasId: 'canvas' },
      locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }), db: async () => fake.db }
    };
  }

  it('rejects a request with no nodes, before writing', async () => {
    const input = event({ nodes: '[]', edges: '[]' });
    const result = await actions.paste(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('rejects a node whose data does not match its type, before writing any of the batch', async () => {
    const input = event({
      nodes: JSON.stringify([{ type: 'text', data: { no_prompt: true }, x: 0, y: 0 }]),
      edges: '[]'
    });
    const result = await actions.paste(input as never);
    expect(result).toMatchObject({ status: 400 });
    expect(input.calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('creates every pasted node', async () => {
    const input = event({
      nodes: JSON.stringify([{ type: 'text', data: { prompt: 'ciao' }, x: 10, y: 20 }]),
      edges: '[]'
    });
    const result = await actions.paste(input as never);
    expect(result).not.toMatchObject({ status: 400 });
    expect(input.calls.filter((call) => call.table === 'nodes' && call.op === 'insert')).toHaveLength(1);
  });
});
