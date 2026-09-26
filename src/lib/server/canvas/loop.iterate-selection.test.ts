import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';

/**
 * IL DIFETTO VERO: `runOneCombination` risolve l'upstream CON `iterateSelection` per decidere se
 * bloccare (`upstream.blocked`), poi passa a `runGenNode` uno `StartRun` che non porta quella
 * selezione da nessuna parte — `runGenNode` (`generate.ts`) rilegge l'upstream DA SOLO, senza
 * `iterateSelection`, e un nodo `list` senza selezione si comporta come un filo `fixed`: dà
 * `referenceImageUrls[0]`, sempre lo stesso, il primo item della lista, per OGNI iterazione.
 *
 * Due immagini collegate a una `list` vuota (`data.items: []`), la `list` collegata `iterate` a
 * un nodo immagine: due iterazioni devono ricevere `baseMediaId` DIVERSO, il proprio item —
 * questo test le rigira una alla volta (`retryLoopCombination`, lo stesso motore di
 * `drainLoopQueue`) e lo verifica sulla chiamata reale a `generateImagesWithoutBrand`.
 */

const { modalitiesOf } = vi.hoisted(() => ({ modalitiesOf: vi.fn() }));
vi.mock('$lib/server/ai-models-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/ai-models-sync')>()),
  modalitiesOf
}));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => ({}) }));

const { generateImagesWithoutBrand } = vi.hoisted(() => ({ generateImagesWithoutBrand: vi.fn() }));
vi.mock('$lib/server/media-generate', () => ({ generateImagesWithoutBrand }));

import { retryLoopCombination } from './loop';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const CANVAS = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';
const GEN_NODE = '55555555-5555-5555-5555-555555555555';
const LIST_NODE = '66666666-6666-6666-6666-666666666666';
const WIRED_A = '77777777-7777-7777-7777-777777777777';
const WIRED_B = '88888888-8888-8888-8888-888888888888';
const OUTPUT_LIST = '99999999-9999-9999-9999-999999999999';

const nodeRow = (id: string, type: string, data: Record<string, unknown>, version = 1) => ({
  id,
  org_id: ORG,
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

const edge = (id: string, source: string, target: string, mode: 'fixed' | 'iterate') => ({
  id,
  org_id: ORG,
  canvas_id: CANVAS,
  source_node_id: source,
  target_node_id: target,
  source_handle: null,
  target_handle: null,
  mode,
  deleted_at: null
});

beforeEach(() => {
  modalitiesOf.mockReset();
  modalitiesOf.mockResolvedValue({ input: ['text', 'image'], output: ['image'], synced_at: 'now' });
  generateImagesWithoutBrand.mockReset();
  generateImagesWithoutBrand.mockImplementation(async (_db, job) => ({
    ok: true,
    media: [{ storage_path: `out-${job.baseMediaId}.png`, mime: 'image/png', width: 1, height: 1 }],
    costUsd: 0.01
  }));
});

describe('un asse iterate su una list: ogni iterazione riceve il PROPRIO item, non sempre il primo', () => {
  it('due combinazioni contro una list di 2 immagini wired: baseMediaId cambia fra le due', async () => {
    const { db } = fakeDb(
      {
        nodes: [
          nodeRow(GEN_NODE, 'image', { prompt: 'trasforma', model: 'qwen3-pro' }, 5),
          nodeRow(LIST_NODE, 'list', { item_kind: 'image', items: [] }),
          nodeRow(WIRED_A, 'image', { prompt: 'uno', refId: 'asset-a' }),
          nodeRow(WIRED_B, 'image', { prompt: 'due', refId: 'asset-b' }),
          nodeRow(OUTPUT_LIST, 'list', { item_kind: 'image', items: [{ label: '1', status: 'queued' }, { label: '2', status: 'queued' }] })
        ],
        nodes_connections: [
          edge('e1', WIRED_A, LIST_NODE, 'fixed'),
          edge('e2', WIRED_B, LIST_NODE, 'fixed'),
          edge('e3', LIST_NODE, GEN_NODE, 'iterate')
        ],
        assets: [
          { id: 'asset-a', org_id: ORG, project_id: PROJECT, type: 'image', url: 'a.png', content: null },
          { id: 'asset-b', org_id: ORG, project_id: PROJECT, type: 'image', url: 'b.png', content: null }
        ]
      },
      {
        filter: true,
        updateRows: {
          nodes: [nodeRow(GEN_NODE, 'image', { prompt: 'trasforma', model: 'qwen3-pro' }, 5)],
          node_runs: []
        }
      }
    );

    await retryLoopCombination(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: GEN_NODE,
      userId: USER,
      outputListNodeId: OUTPUT_LIST,
      combination: { label: '1', values: { [LIST_NODE]: '1' } }
    });

    await retryLoopCombination(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: GEN_NODE,
      userId: USER,
      outputListNodeId: OUTPUT_LIST,
      combination: { label: '2', values: { [LIST_NODE]: '2' } }
    });

    expect(generateImagesWithoutBrand).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = generateImagesWithoutBrand.mock.calls;
    const firstBaseMediaId = firstCall[1].baseMediaId;
    const secondBaseMediaId = secondCall[1].baseMediaId;

    expect(firstBaseMediaId).toBeTruthy();
    expect(secondBaseMediaId).toBeTruthy();
    expect(secondBaseMediaId).not.toBe(firstBaseMediaId);
  });
});
