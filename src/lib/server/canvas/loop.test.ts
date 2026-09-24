import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';

const runGenNode = vi.fn();
vi.mock('$lib/server/canvas/generate', () => ({ runGenNode: (...args: unknown[]) => runGenNode(...args) }));

const { modalitiesOf } = vi.hoisted(() => ({ modalitiesOf: vi.fn() }));
vi.mock('$lib/server/ai-models-sync', () => ({ modalitiesOf }));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => ({}) }));

const { orgCreditBalance } = vi.hoisted(() => ({ orgCreditBalance: vi.fn() }));
vi.mock('$lib/server/credits', () => ({ orgCreditBalance }));

import { planLoop, enqueueLoop, drainLoopQueue, cancelLoop, retryLoopCombination } from './loop';

/**
 * QUESTI TEST NON DIPENDONO DA `nodes_connections.mode` — quella colonna non è ancora applicata
 * (`20260923_loop_nodes.sql`, pendente), e `repos/canvas.ts` (hotfix `fe41ffa1`) legge OGNI arco
 * come `fixed` finché non lo è. Il loop senza assi ("repeat N", CLAUDE.md) È la strada che
 * funziona ORA. I test per gli assi `iterate` sono `it.skip`, con lo stesso motivo nel nome.
 *
 * LA DURABILITÀ È IL PUNTO DI QUESTI TEST: `enqueueLoop` non gira niente — mette in coda e torna;
 * `drainLoopQueue` (il cron) reclama e gira un lotto; un tick che sovrappone un altro non ne
 * ruba il lavoro (claim atomico); cancellare ferma solo chi è ancora in coda; un fallimento non
 * blocca le altre combinazioni.
 */

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const CANVAS = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';
const GEN_NODE = '55555555-5555-5555-5555-555555555555';
const LIST_NODE_A = '66666666-6666-6666-6666-666666666666';

const nodeRow = (id: string, type: string, data: Record<string, unknown>, version = 1) => ({
  id,
  canvas_id: CANVAS,
  project_id: PROJECT,
  type,
  display_name: null,
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
  node_id: GEN_NODE,
  prompt: 'un gatto',
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

beforeEach(() => {
  runGenNode.mockReset();
  modalitiesOf.mockReset();
  modalitiesOf.mockResolvedValue({ input: ['text', 'image'], output: ['image'], synced_at: 'now' });
  orgCreditBalance.mockReset();
  orgCreditBalance.mockResolvedValue(100_000);
});

describe('planLoop — il preventivo, senza girare niente', () => {
  it('nessun asse: repeat N vale N varianti, e il costo è N × il prezzo unitario', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', params: { repeat: 3 } })],
      nodes_connections: []
    });

    const out = await planLoop(db, { orgId: ORG, canvasId: CANVAS, nodeId: GEN_NODE });

    expect(out.combinations).toHaveLength(3);
    expect(out.safety.verdict).toBe('run');
    expect(out.cost.total).toBe(out.cost.perRun * 3);
    expect(runGenNode).not.toHaveBeenCalled();
  });

  it('repeat assente: una sola variante, come oggi (comportamento invariato)', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro' })],
      nodes_connections: []
    });

    const out = await planLoop(db, { orgId: ORG, canvasId: CANVAS, nodeId: GEN_NODE });

    expect(out.combinations).toHaveLength(1);
    expect(out.safety.verdict).toBe('run');
  });

  it.skip('un asse iterate da una list con 4 item: 4 combinazioni [in attesa di 20260923_loop_nodes.sql]', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro' }),
        nodeRow(LIST_NODE_A, 'list', { item_kind: 'image', items: [{ asset_id: 'a1' }, { asset_id: 'a2' }, { asset_id: 'a3' }, { asset_id: 'a4' }] })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: LIST_NODE_A, target_node_id: GEN_NODE, source_handle: null, target_handle: null, mode: 'iterate' }
      ]
    });

    const out = await planLoop(db, { orgId: ORG, canvasId: CANVAS, nodeId: GEN_NODE });

    expect(out.combinations).toHaveLength(4);
  });
});

describe('enqueueLoop — valida, controlla i crediti del TOTALE, mette in coda, e ritorna — mai gira niente', () => {
  it('sopra 1000 varianti (repeat) rifiuta senza mettere in coda nulla, anche con confirmed:true', async () => {
    const { db, calls } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'x', model: 'qwen3-pro', params: { repeat: 1001 } })],
      nodes_connections: []
    });

    const out = await enqueueLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('refused');
    expect(calls.some((c) => c.table === 'node_runs' && c.op === 'insert')).toBe(false);
  });

  it('sopra 50 varianti senza confirmed:true chiede conferma, mai mette in coda', async () => {
    const { db, calls } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'x', model: 'qwen3-pro', params: { repeat: 51 } })],
      nodes_connections: []
    });

    const out = await enqueueLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER });

    expect(out.kind).toBe('needs_confirmation');
    expect(calls.some((c) => c.table === 'node_runs' && c.op === 'insert')).toBe(false);
  });

  it('crediti insufficienti per l\'INTERO loop rifiutano PRIMA di mettere in coda — mai scoperti vuoti a metà', async () => {
    orgCreditBalance.mockResolvedValue(10);

    const { db, calls } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', params: { repeat: 5 } })],
      nodes_connections: []
    });

    const out = await enqueueLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('refused');
    expect(calls.some((c) => c.table === 'node_runs' && c.op === 'insert')).toBe(false);
  });

  it('mette in coda un biglietto per variante, crea un output list, e NON chiama runGenNode', async () => {
    const { db, calls } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', params: { repeat: 3 } })],
      nodes_connections: [],
      node_runs: [runRow({ id: 'r1' }), runRow({ id: 'r2' }), runRow({ id: 'r3' })]
    });

    const out = await enqueueLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('enqueued');
    if (out.kind !== 'enqueued') throw new Error('unreachable');
    expect(out.total).toBe(3);
    expect(out.runIds).toHaveLength(3);
    expect(out.outputListNodeId).toBeTruthy();

    const runInserts = calls.filter((c) => c.table === 'node_runs' && c.op === 'insert');
    expect(runInserts).toHaveLength(3);
    for (const insert of runInserts) {
      expect(insert.payload).toMatchObject({
        org_id: ORG,
        node_id: GEN_NODE,
        params: { loop: expect.objectContaining({ phase: 'queued' }) }
      });
    }

    const listInsert = calls.find((c) => c.table === 'nodes' && c.op === 'insert');
    expect(listInsert?.payload).toMatchObject({ type: 'list' });
    expect(runGenNode).not.toHaveBeenCalled();
  });
});

describe('drainLoopQueue — il cron drena un lotto, con lo stesso motore', () => {
  it('reclama i biglietti in coda e chiama runGenNode una volta ciascuno', async () => {
    const ticket = { loop: { phase: 'queued', outputListNodeId: 'list-1', label: 'variante 1', values: {}, projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db, calls } = fakeDb(
      {
        node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket })],
        nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro' }, 5), nodeRow('list-1', 'list', { item_kind: 'image', items: [{ label: 'variante 1', status: 'queued' }] })]
      },
      { updateRows: { node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket, status: 'finishing' })] } }
    );

    runGenNode.mockResolvedValue({
      kind: 'done',
      run: { id: 'real-run', status: 'done', outputAssetId: 'asset-1', costUsd: 0.07 },
      asset: { id: 'asset-1', type: 'image', url: 'https://cdn/1.png' }
    });

    const out = await drainLoopQueue(db, { limit: 10 });

    expect(out).toMatchObject({ claimed: 1, done: 1, failed: 0 });
    expect(runGenNode).toHaveBeenCalledTimes(1);
    const claimUpdate = calls.find((c) => c.table === 'node_runs' && c.op === 'update' && (c.payload as { status?: string })?.status === 'finishing');
    expect(claimUpdate).toBeTruthy();
  });

  it('un biglietto già reclamato (status finishing) non viene ripreso da un secondo drain nello stesso lotto', async () => {
    const ticket = { loop: { phase: 'queued', outputListNodeId: 'list-1', label: 'v1', values: {}, projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db } = fakeDb(
      { node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket })], nodes: [] },
      { updateRows: { node_runs: [] } }
    );

    const out = await drainLoopQueue(db, { limit: 10 });

    expect(out).toMatchObject({ claimed: 0 });
    expect(runGenNode).not.toHaveBeenCalled();
  });

  it('un fallimento su una combinazione non ferma le altre — chiude quella e continua', async () => {
    const ticket1 = { loop: { phase: 'queued', outputListNodeId: 'list-1', label: 'v1', values: {}, projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db } = fakeDb(
      {
        node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket1 })],
        nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro' }, 5), nodeRow('list-1', 'list', { item_kind: 'image', items: [{ label: 'v1', status: 'queued' }] })]
      },
      { updateRows: { node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket1, status: 'finishing' })] } }
    );

    runGenNode.mockResolvedValue({ kind: 'refused', error: 'store_failed' });

    const out = await drainLoopQueue(db, { limit: 10 });

    expect(out).toMatchObject({ claimed: 1, done: 0, failed: 1 });
  });

  it('ignora le run che non sono biglietti di loop (un giro ordinario in running)', async () => {
    const { db } = fakeDb({ node_runs: [runRow({ id: 'r1', params: {} })], nodes: [] });

    const out = await drainLoopQueue(db, { limit: 10 });

    expect(out).toMatchObject({ claimed: 0, done: 0, failed: 0 });
    expect(runGenNode).not.toHaveBeenCalled();
  });
});

describe('cancelLoop — ferma solo i biglietti non ancora reclamati', () => {
  it('chiude i biglietti in coda come falliti con error=cancelled, ne conta quanti', async () => {
    const ticket = { loop: { phase: 'queued', outputListNodeId: 'list-1', label: 'v1', values: {}, projectId: PROJECT, canvasId: CANVAS, userId: USER } };
    const { db, calls } = fakeDb(
      { node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket })], nodes: [nodeRow('list-1', 'list', { item_kind: 'image', items: [{ label: 'v1', status: 'queued' }] })] },
      { updateRows: { node_runs: [runRow({ id: 'r1', node_id: GEN_NODE, params: ticket, status: 'finishing' })] } }
    );

    const out = await cancelLoop(db, { orgId: ORG, nodeId: GEN_NODE });

    expect(out).toMatchObject({ cancelled: 1 });
    const failUpdate = calls.find((c) => c.table === 'node_runs' && c.op === 'update' && (c.payload as { error?: string })?.error === 'cancelled');
    expect(failUpdate).toBeTruthy();
  });
});

describe('retryLoopCombination — rilancia UNA combinazione, subito, mai in coda', () => {
  it('chiama runGenNode e aggiorna solo l\'item corrispondente', async () => {
    const { db, calls } = fakeDb(
      {
        nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro' }, 5), nodeRow('list-1', 'list', { item_kind: 'image', items: [{ label: 'v1', status: 'failed' }, { label: 'v2', status: 'done', asset_id: 'other' }] })]
      },
      { updateRows: { nodes: [nodeRow('list-1', 'list', { item_kind: 'image', items: [] })] } }
    );

    runGenNode.mockResolvedValue({
      kind: 'done',
      run: { id: 'real-run', status: 'done', outputAssetId: 'asset-1', costUsd: 0.07 },
      asset: { id: 'asset-1', type: 'image', url: 'https://cdn/1.png' }
    });

    const out = await retryLoopCombination(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: GEN_NODE,
      userId: USER,
      outputListNodeId: 'list-1',
      combination: { label: 'v1', values: {} }
    });

    expect(out.outcome).toBe('done');
    expect(runGenNode).toHaveBeenCalledTimes(1);
    const listUpdate = calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(listUpdate).toBeTruthy();
  });
});
