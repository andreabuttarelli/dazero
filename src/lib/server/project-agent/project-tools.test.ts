import { describe, expect, it } from 'vitest';
import type { Tool } from 'ai';
import { fakeDb } from '$lib/server/db/fake-db';
import { createProjectTools } from './project-tools';
import { SIDEBAR_AGENT_KEY } from '$lib/server/repos/actor';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const CANVAS = '33333333-3333-3333-3333-333333333333';
const NODE = '44444444-4444-4444-4444-444444444444';
const USER = '55555555-5555-5555-5555-555555555555';
const RUN = '66666666-6666-6666-6666-666666666666';

const run = (t: Tool, args: unknown) =>
  (t.execute as (a: unknown, o: unknown) => Promise<unknown>)(args, { toolCallId: 't1', messages: [] });

const nodeRow = {
  id: NODE,
  org_id: ORG,
  project_id: PROJECT,
  canvas_id: CANVAS,
  type: 'text',
  display_name: null,
  x: 0,
  y: 0,
  z: 0,
  width: null,
  height: null,
  data: { prompt: 'ciao', model: 'm1' },
  version: 3
};

const runRow = {
  id: RUN,
  org_id: ORG,
  node_id: NODE,
  prompt: 'ciao',
  model: 'm1',
  params: {},
  status: 'running',
  error: null,
  output_asset_id: null,
  external_job_id: null,
  cost_usd: null,
  attempts: 0,
  started_at: '2026-09-21T00:00:00Z',
  finished_at: null,
  actor_kind: 'agent',
  actor_id: USER
};

describe('update_node — zero righe è un conflitto, mai un successo silenzioso', () => {
  it('torna outcome conflict quando la versione è stantia', async () => {
    const { db } = fakeDb({ nodes: [nodeRow] }, { updateRows: { nodes: [] } });
    const tools = createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });

    const out = await run(tools.update_node, { nodeId: NODE, data: { prompt: 'x' }, expectedVersion: 3 });

    expect(out).toMatchObject({ outcome: 'conflict' });
  });

  it('dice scritto solo quando la riga torna davvero', async () => {
    const written = { ...nodeRow, version: 4, data: { prompt: 'x' } };
    const { db } = fakeDb({ nodes: [nodeRow] }, { updateRows: { nodes: [written] } });
    const tools = createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });

    const out = await run(tools.update_node, { nodeId: NODE, data: { prompt: 'x' }, expectedVersion: 3 });

    expect(out).toMatchObject({ outcome: 'written' });
    expect((out as { node: { version: number } }).node.version).toBe(4);
  });
});

describe('le scritture firmano agent per conto della persona', () => {
  it('create_node porta actor_kind, actor_id e agent_key', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow] });
    const tools = createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });

    await run(tools.create_node, { canvasId: CANVAS, type: 'text', x: 1, y: 2, data: { prompt: 'p' } });

    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.table).toBe('nodes');
    expect(insert.payload).toMatchObject({
      org_id: ORG,
      project_id: PROJECT,
      actor_kind: 'agent',
      actor_id: USER,
      agent_key: SIDEBAR_AGENT_KEY
    });
  });

  it('run_node scrive la run come agente, col user id', async () => {
    // findNode trova il nodo; writeNodeData non scrive (updateRows vuoto) → conflict dopo createRun.
    const { db, calls } = fakeDb(
      { nodes: [nodeRow], node_runs: [runRow] },
      { updateRows: { nodes: [] } }
    );
    const tools = createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });

    const out = await run(tools.run_node, {
      nodeId: NODE,
      medium: 'text',
      prompt: 'ciao',
      model: 'm1',
      expectedVersion: 3
    });

    const insert = calls.find((c) => c.op === 'insert' && c.table === 'node_runs')!;
    expect(insert).toBeDefined();
    expect(insert.payload).toMatchObject({
      org_id: ORG,
      node_id: NODE,
      actor_kind: 'agent',
      actor_id: USER
    });
    expect(out).toMatchObject({ outcome: 'conflict' });
  });

  it('ogni scrittura porta org_id nel payload o nel WHERE', async () => {
    const { db, calls } = fakeDb({ nodes: [nodeRow], nodes_connections: [{}] });
    const tools = createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });

    await run(tools.delete_node, { nodeId: NODE });
    await run(tools.move_node, { nodeId: NODE, x: 1, y: 2 });
    await run(tools.connect_nodes, { canvasId: CANVAS, sourceNodeId: NODE, targetNodeId: NODE });

    const writes = calls.filter((c) => c.op === 'insert' || c.op === 'update');
    expect(writes.length).toBeGreaterThan(2);
    for (const call of writes) {
      const payloadHasOrg = JSON.stringify(call.payload ?? {}).includes(ORG);
      const filterHasOrg = call.filters.some(([col, val]) => col === 'org_id' && val === ORG);
      expect(payloadHasOrg || filterHasOrg, `${call.table} ${call.op} senza org_id`).toBe(true);
    }
  });
});

describe('run_node rifiuta prima di spendere', () => {
  it('un medium che non esiste non apre nessuna run', async () => {
    const { db, calls } = fakeDb({ node_runs: [runRow], nodes: [nodeRow] });
    const tools = createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });

    const out = await run(tools.run_node, { nodeId: NODE, medium: 'gif', expectedVersion: 3 });

    expect(out).toMatchObject({ error: 'bad_medium' });
    expect(calls.some((c) => c.table === 'node_runs')).toBe(false);
  });
});
