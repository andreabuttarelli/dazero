import { describe, expect, it } from 'vitest';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import { recordEvent, listCanvasEvents } from './canvas-events';
import type { Actor } from './actor';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANVAS = '22222222-2222-2222-2222-222222222222';
const NODE = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';

const eventRow = {
  id: 1,
  org_id: ORG,
  canvas_id: CANVAS,
  kind: 'node.update',
  node_id: NODE,
  edge_id: null,
  before: { prompt: 'vecchio' },
  after: { prompt: 'nuovo' },
  actor_kind: 'user',
  actor_id: USER,
  agent_key: null,
  created_at: '2026-09-22T00:00:00Z'
};

describe('recordEvent: ogni scrittura porta org_id e l attore', () => {
  it('un evento senza actor scrive system, mai un null muto', async () => {
    const { db, calls } = fakeDb({ canvas_events: [{ ...eventRow, actor_kind: 'system', actor_id: null }] });

    await recordEvent(db, { orgId: ORG, canvasId: CANVAS, kind: 'node.update', nodeId: NODE, before: {}, after: {} });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({
      org_id: ORG,
      actor_kind: 'system',
      actor_id: null
    });
  });

  it('un evento con actor utente porta la tripla intera', async () => {
    const { db, calls } = fakeDb({ canvas_events: [eventRow] });
    const actor: Actor = { kind: 'user', id: USER };

    await recordEvent(db, {
      orgId: ORG,
      canvasId: CANVAS,
      kind: 'node.update',
      nodeId: NODE,
      before: { prompt: 'vecchio' },
      after: { prompt: 'nuovo' },
      actor
    });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({
      actor_kind: 'user',
      actor_id: USER,
      agent_key: null
    });
  });

  it('before/after arrivano sempre, anche quando nessuno chiederà mai di annullare questo evento', async () => {
    const { db, calls } = fakeDb({ canvas_events: [eventRow] });

    await recordEvent(db, {
      orgId: ORG,
      canvasId: CANVAS,
      kind: 'node.delete',
      nodeId: NODE,
      before: { x: 1, y: 2 }
    });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ before: { x: 1, y: 2 }, after: null });
  });

  it('restituisce la forma di dominio, non la riga grezza', async () => {
    const { db } = fakeDb({ canvas_events: [eventRow] });

    const event = await recordEvent(db, {
      orgId: ORG,
      canvasId: CANVAS,
      kind: 'node.update',
      nodeId: NODE,
      before: { prompt: 'vecchio' },
      after: { prompt: 'nuovo' },
      actor: { kind: 'user', id: USER }
    });

    expect(event).toEqual({
      id: 1,
      orgId: ORG,
      canvasId: CANVAS,
      kind: 'node.update',
      nodeId: NODE,
      edgeId: null,
      before: { prompt: 'vecchio' },
      after: { prompt: 'nuovo' },
      actorKind: 'user',
      actorId: USER,
      agentKey: null,
      createdAt: '2026-09-22T00:00:00Z'
    });
  });
});

describe('listCanvasEvents: l attività di una tela resta dentro la sua org', () => {
  it('filtra su org_id e canvas_id', async () => {
    const { db, calls } = fakeDb({ canvas_events: [eventRow] });

    await listCanvasEvents(db, { orgId: ORG, canvasId: CANVAS });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, canvas_id: CANVAS });
  });
});
