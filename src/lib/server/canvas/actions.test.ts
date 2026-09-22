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
});
