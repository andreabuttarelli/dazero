import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';

const runGenNode = vi.fn();
vi.mock('$lib/server/canvas/generate', () => ({ runGenNode: (...args: unknown[]) => runGenNode(...args) }));

const { modalitiesOf } = vi.hoisted(() => ({ modalitiesOf: vi.fn() }));
vi.mock('$lib/server/ai-models-sync', () => ({ modalitiesOf }));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => ({}) }));

import { planLoop, runLoop } from './loop';

/**
 * QUESTI TEST NON DIPENDONO DA `nodes_connections.mode` — quella colonna non è ancora applicata
 * (`20260923_loop_nodes.sql`, pendente), e `repos/canvas.ts` (hotfix `fe41ffa1`) legge OGNI arco
 * come `fixed` finché non lo è: un test che semina `mode: 'iterate'` nella riga finta e si aspetta
 * un asse attivo starebbe testando un comportamento impossibile in produzione oggi. Il loop senza
 * assi ("repeat N", CLAUDE.md) È la strada che funziona ORA, e questi test la esercitano davvero.
 * I test per gli assi `iterate` vivono più sotto, `it.skip`, con lo stesso motivo nel nome —
 * riattivarli è il lavoro di quando la migrazione atterra, non prima.
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

beforeEach(() => {
  runGenNode.mockReset();
  modalitiesOf.mockReset();
  modalitiesOf.mockResolvedValue({ input: ['text', 'image'], output: ['image'], synced_at: 'now' });
});

describe('planLoop — il preventivo, senza girare niente', () => {
  it('nessun asse: repeat N vale N varianti, e il costo è N × il prezzo unitario', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', repeat: 3 })],
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

  it.skip('sopra 1000 combinazioni: refuse, e planLoop non gira nulla [in attesa di 20260923_loop_nodes.sql]', async () => {
    const bigItems = Array.from({ length: 32 }, (_, i) => ({ asset_id: `a${i}` }));
    const { db } = fakeDb({
      nodes: [
        nodeRow(GEN_NODE, 'image', { prompt: 'x', model: 'qwen3-pro' }),
        nodeRow('la', 'list', { item_kind: 'image', items: bigItems }),
        nodeRow('lb', 'list', { item_kind: 'image', items: bigItems })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: 'la', target_node_id: GEN_NODE, source_handle: null, target_handle: null, mode: 'iterate' },
        { id: 'e2', canvas_id: CANVAS, source_node_id: 'lb', target_node_id: GEN_NODE, source_handle: null, target_handle: null, mode: 'iterate' }
      ]
    });

    const out = await planLoop(db, { orgId: ORG, canvasId: CANVAS, nodeId: GEN_NODE });

    expect(out.combinations.length).toBe(32 * 32);
    expect(out.safety.verdict).toBe('refuse');
  });
});

describe('runLoop — esegue col motore reale, mai una copia', () => {
  it('sopra 50 varianti (repeat) senza `confirmed: true` chiede conferma, mai gira', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'x', model: 'qwen3-pro', repeat: 51 })],
      nodes_connections: []
    });

    const out = await runLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER });

    expect(out.kind).toBe('needs_confirmation');
    expect(runGenNode).not.toHaveBeenCalled();
  });

  it('sopra 1000 varianti (repeat) rifiuta senza girare nulla, anche con confirmed:true', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'x', model: 'qwen3-pro', repeat: 1001 })],
      nodes_connections: []
    });

    const out = await runLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('refused');
    expect(runGenNode).not.toHaveBeenCalled();
  });

  it('chiama runGenNode UNA volta per variante, con lo stesso motore del bottone Genera', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', repeat: 2 }, 5)],
      nodes_connections: []
    });

    runGenNode.mockResolvedValue({ kind: 'done', run: { id: 'run-x', status: 'done', outputAssetId: 'asset-x' }, asset: { id: 'asset-x', type: 'image', url: 'https://cdn/x.png' } });

    const out = await runLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('ran');
    expect(runGenNode).toHaveBeenCalledTimes(2);
    for (const call of runGenNode.mock.calls) {
      expect(call[1]).toMatchObject({ orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, medium: 'image' });
    }
  });

  it('un fallimento su una variante non ferma le altre — i risultati completati sopravvivono', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', repeat: 2 }, 5)],
      nodes_connections: []
    });

    runGenNode
      .mockResolvedValueOnce({ kind: 'done', run: { id: 'run-1', status: 'done', outputAssetId: 'asset-1' }, asset: { id: 'asset-1', type: 'image', url: 'https://cdn/1.png' } })
      .mockResolvedValueOnce({ kind: 'refused', error: 'store_failed' });

    const out = await runLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('ran');
    expect(out.results).toHaveLength(2);
    expect(out.results[0].outcome).toBe('done');
    expect(out.results[1].outcome).toBe('failed');
  });

  it('deposita un nodo list di output con un item per combinazione riuscita', async () => {
    const { db, calls } = fakeDb({
      nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro', repeat: 2 }, 5)],
      nodes_connections: []
    });

    runGenNode.mockResolvedValue({ kind: 'done', run: { id: 'run-x', status: 'done', outputAssetId: 'asset-x' }, asset: { id: 'asset-x', type: 'image', url: 'https://cdn/x.png' } });

    const out = await runLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('ran');
    expect(out.outputListNodeId).toBeTruthy();
    const insert = calls.find((c) => c.table === 'nodes' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ type: 'list' });
  });

  it.skip('un asse iterate da una list con 2 item porta iterateSelection a runOneCombination [in attesa di 20260923_loop_nodes.sql]', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(GEN_NODE, 'image', { prompt: 'un gatto', model: 'qwen3-pro' }, 5),
        nodeRow(LIST_NODE_A, 'list', { item_kind: 'image', items: [{ asset_id: 'a1' }, { asset_id: 'a2' }] })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: LIST_NODE_A, target_node_id: GEN_NODE, source_handle: null, target_handle: null, mode: 'iterate' }
      ]
    });

    runGenNode.mockResolvedValue({ kind: 'done', run: { id: 'run-x', status: 'done', outputAssetId: 'asset-x' }, asset: { id: 'asset-x', type: 'image', url: 'https://cdn/x.png' } });

    const out = await runLoop(db, { orgId: ORG, projectId: PROJECT, canvasId: CANVAS, nodeId: GEN_NODE, userId: USER, confirmed: true });

    expect(out.kind).toBe('ran');
    expect(runGenNode).toHaveBeenCalledTimes(2);
  });
});
