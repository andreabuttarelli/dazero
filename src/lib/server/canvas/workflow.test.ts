import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';

const runGenNode = vi.fn();
vi.mock('$lib/server/canvas/generate', () => ({ runGenNode: (...args: unknown[]) => runGenNode(...args) }));

import { enqueueWorkflow, drainWorkflowQueue, cancelWorkflow } from './workflow';

/**
 * LA STESSA DISCIPLINA DI `loop.test.ts`: `enqueueWorkflow` mette in coda e torna, mai gira;
 * `drainWorkflowQueue` (il cron) reclama e gira col motore vero; un passo bloccato da un
 * fallimento a monte si chiude senza girare, col nome del passo fallito nel messaggio.
 */

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const CANVAS = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';
const NODE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NODE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NODE_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const nodeRow = (id: string, type: string, data: Record<string, unknown>, version = 1, displayName: string | null = null) => ({
  id,
  org_id: ORG,
  canvas_id: CANVAS,
  project_id: PROJECT,
  type,
  display_name: displayName,
  x: 0,
  y: 0,
  z: 0,
  width: null,
  height: null,
  data,
  version
});

const runRow = (over: Record<string, unknown>) => ({
  id: 'run-id',
  org_id: ORG,
  node_id: NODE_A,
  prompt: 'x',
  model: 'qwen3-pro',
  params: {},
  status: 'running',
  error: null,
  output_asset_id: null,
  external_job_id: null,
  cost_usd: null,
  attempts: 0,
  claimed_at: null,
  started_at: '2026-09-24T00:00:00Z',
  finished_at: null,
  actor_kind: 'user',
  actor_id: null,
  ...over
});

const connRow = (source: string, target: string) => ({
  id: `${source}-${target}`,
  org_id: ORG,
  canvas_id: CANVAS,
  source_node_id: source,
  target_node_id: target,
  source_handle: null,
  target_handle: null,
  mode: 'fixed',
  deleted_at: null
});

beforeEach(() => {
  runGenNode.mockReset();
});

describe('enqueueWorkflow — valida, mette in coda un biglietto per passo, mai gira', () => {
  it('due nodi collegati: due biglietti workflow, dependsOn corretto, nessuna generazione', async () => {
    const { db, calls } = fakeDb(
      {
        nodes: [nodeRow(NODE_A, 'text', { prompt: 'a' }), nodeRow(NODE_B, 'image', { prompt: 'b' })],
        nodes_connections: [connRow(NODE_A, NODE_B)],
        node_runs: [runRow({ id: 'r1' }), runRow({ id: 'r2' })]
      },
      { filter: true }
    );

    const out = await enqueueWorkflow(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeIds: [NODE_A, NODE_B],
      userId: USER
    });

    expect(out.kind).toBe('enqueued');
    if (out.kind !== 'enqueued') throw new Error('unreachable');
    expect(out.steps).toHaveLength(2);

    const inserts = calls.filter((c) => c.table === 'node_runs' && c.op === 'insert');
    expect(inserts).toHaveLength(2);
    expect(runGenNode).not.toHaveBeenCalled();
  });

  it('selezione non valida (disconnessa): rifiuta senza scrivere nulla', async () => {
    const { db, calls } = fakeDb(
      { nodes: [nodeRow(NODE_A, 'text', {}), nodeRow(NODE_B, 'image', {})], nodes_connections: [] },
      { filter: true }
    );

    const out = await enqueueWorkflow(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeIds: [NODE_A, NODE_B], userId: USER });

    expect(out.kind).toBe('refused');
    expect(calls.some((c) => c.table === 'node_runs' && c.op === 'insert')).toBe(false);
  });
});

describe('drainWorkflowQueue — il cron drena, rispettando le dipendenze', () => {
  it('A fatto (done), B dipende da A: B è pronto, gira e chiude done', async () => {
    const ticketB = { workflow: { phase: 'queued', workflowId: 'wf1', dependsOn: ['run-a'], projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db } = fakeDb(
      {
        node_runs: [runRow({ id: 'run-a', node_id: NODE_A, status: 'done' }), runRow({ id: 'run-b', node_id: NODE_B, params: ticketB })],
        nodes: [nodeRow(NODE_A, 'text', {}, 5), nodeRow(NODE_B, 'image', { prompt: 'b' }, 5)]
      },
      { updateRows: { node_runs: [runRow({ id: 'run-b', node_id: NODE_B, params: ticketB, status: 'finishing' })] } }
    );

    runGenNode.mockResolvedValue({
      kind: 'done',
      run: { id: 'real-run', status: 'done', outputAssetId: 'asset-1', costUsd: 0.05 },
      asset: { id: 'asset-1', type: 'image', url: 'https://cdn/1.png' }
    });

    const out = await drainWorkflowQueue(db, { limit: 10 });

    expect(out.claimed).toBe(1);
    expect(out.done).toBe(1);
    expect(runGenNode).toHaveBeenCalledTimes(1);
  });

  it('A ancora running: B resta waiting, non reclamato, non girato', async () => {
    const ticketB = { workflow: { phase: 'queued', workflowId: 'wf1', dependsOn: ['run-a'], projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db } = fakeDb({
      node_runs: [runRow({ id: 'run-a', node_id: NODE_A, status: 'running' }), runRow({ id: 'run-b', node_id: NODE_B, params: ticketB })],
      nodes: []
    });

    const out = await drainWorkflowQueue(db, { limit: 10 });

    expect(out.claimed).toBe(0);
    expect(runGenNode).not.toHaveBeenCalled();
  });

  it('A fallito: C (dipende da A) è chiuso blocked col messaggio, senza girare', async () => {
    const ticketC = { workflow: { phase: 'queued', workflowId: 'wf1', dependsOn: ['run-a'], projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db, calls } = fakeDb(
      {
        node_runs: [runRow({ id: 'run-a', node_id: NODE_A, status: 'failed' }), runRow({ id: 'run-c', node_id: NODE_C, params: ticketC })],
        nodes: [nodeRow(NODE_A, 'text', {}, 1, 'Prompt A'), nodeRow(NODE_C, 'image', {}, 5)]
      },
      { updateRows: { node_runs: [runRow({ id: 'run-c', node_id: NODE_C, params: ticketC, status: 'finishing' })] } }
    );

    const out = await drainWorkflowQueue(db, { limit: 10 });

    expect(out.claimed).toBe(1);
    expect(out.blocked).toBe(1);
    expect(runGenNode).not.toHaveBeenCalled();

    const failUpdate = calls.find((c) => c.table === 'node_runs' && c.op === 'update' && (c.payload as { error?: string })?.error?.includes('Fermato'));
    expect(failUpdate).toBeTruthy();
  });

  it('un passo video resta waiting per i suoi dipendenti finché non è done', async () => {
    const ticketDependent = { workflow: { phase: 'queued', workflowId: 'wf1', dependsOn: ['run-video'], projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db } = fakeDb({
      node_runs: [runRow({ id: 'run-video', node_id: NODE_A, status: 'running' }), runRow({ id: 'run-dep', node_id: NODE_B, params: ticketDependent })],
      nodes: []
    });

    const out = await drainWorkflowQueue(db, { limit: 10 });

    expect(out.claimed).toBe(0);
    expect(runGenNode).not.toHaveBeenCalled();
  });
});

describe('cancelWorkflow — ferma i biglietti ancora in coda di UN workflow', () => {
  it('cancella solo i biglietti dello workflowId dato', async () => {
    const ticketA = { workflow: { phase: 'queued', workflowId: 'wf1', dependsOn: [], projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const ticketOther = { workflow: { phase: 'queued', workflowId: 'wf2', dependsOn: [], projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db } = fakeDb(
      {
        node_runs: [runRow({ id: 'run-a', node_id: NODE_A, params: ticketA }), runRow({ id: 'run-x', node_id: NODE_B, params: ticketOther })],
        nodes: [nodeRow(NODE_A, 'text', {}, 5)]
      },
      { updateRows: { node_runs: [runRow({ id: 'run-a', node_id: NODE_A, params: ticketA, status: 'finishing' })] } }
    );

    const out = await cancelWorkflow(db, { orgId: ORG, workflowId: 'wf1' });

    expect(out.cancelled).toBe(1);
  });
});
