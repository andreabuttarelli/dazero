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
