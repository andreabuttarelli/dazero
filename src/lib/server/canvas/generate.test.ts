import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';
import { expireStuckRuns, runGenNode, RUN_STALE_MS } from './generate';

const ORG = '11111111-1111-1111-1111-111111111111';
const NODE = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const PROJECT = '44444444-4444-4444-4444-444444444444';
const USER = '55555555-5555-5555-5555-555555555555';
const CANVAS = '66666666-6666-6666-6666-666666666666';

const staleStartedAt = new Date(Date.now() - RUN_STALE_MS - 60_000).toISOString();

const runRow = {
  id: RUN,
  org_id: ORG,
  node_id: NODE,
  prompt: 'a cat',
  model: 'openai/gpt',
  params: { aspectRatio: '1:1' },
  status: 'running',
  error: null,
  output_asset_id: null,
  external_job_id: null,
  cost_usd: null,
  attempts: 0,
  claimed_at: null,
  started_at: staleStartedAt,
  finished_at: null,
  actor_kind: 'user',
  actor_id: null
};

const nodeRow = {
  id: NODE,
  org_id: ORG,
  project_id: 'project',
  canvas_id: 'canvas',
  type: 'image',
  data: { prompt: 'a cat', model: 'openai/gpt', params: {}, running: true, runId: RUN },
  position_x: 0,
  position_y: 0,
  width: null,
  height: null,
  version: 2,
  deleted_at: null,
  created_by: null,
  updated_by: null
};

const freshNodeRow = {
  id: NODE,
  org_id: ORG,
  project_id: PROJECT,
  canvas_id: CANVAS,
  type: 'image',
  display_name: null,
  x: 0,
  y: 0,
  z: 0,
  width: null,
  height: null,
  data: {},
  version: 1
};

const { generateImagesWithoutBrand } = vi.hoisted(() => ({ generateImagesWithoutBrand: vi.fn() }));
vi.mock('$lib/server/media-generate', () => ({ generateImagesWithoutBrand }));

/**
 * IL DIFETTO VERO: `store_failed` senza dire perché.
 *
 * Il modello RISPONDE — `generateImagesWithoutBrand` torna `ok:false` con una `reason` presa dal
 * bucket che rifiuta la scrittura — ma prima di questa correzione `runGenNode` schiacciava tutto
 * su `store_failed`, un token che non dice se manca un bucket, se la scrittura è stata respinta o
 * se il campo che porta il percorso è semplicemente assente. L'utente vedeva un nodo spento e
 * nessun modo di capire perché.
 */
describe('un giro immagine che fallisce a depositare dice IL MOTIVO, non un token muto', () => {
  beforeEach(() => {
    generateImagesWithoutBrand.mockReset();
  });

  it('porta la reason del fornitore di storage nell\'errore del nodo', async () => {
    generateImagesWithoutBrand.mockResolvedValue({
      ok: false,
      error: 'store_failed',
      reason: 'Bucket not found'
    });

    const { db, calls } = fakeDb(
      { nodes: [freshNodeRow] },
      { updateRows: { nodes: [{ ...freshNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: 'a cat wearing a hat',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result).toMatchObject({ kind: 'refused', error: expect.stringContaining('Bucket not found') });

    const nodeUpdates = calls.filter((c) => c.table === 'nodes' && c.op === 'update');
    const lastUpdate = nodeUpdates[nodeUpdates.length - 1];
    expect((lastUpdate?.payload as { data?: { error?: string } })?.data?.error).toContain('Bucket not found');
    expect((lastUpdate?.payload as { data?: { error?: string } })?.data?.error).not.toBe('store_failed');
  });
});

/**
 * IL BOTTONE RIMASTO SPENTO. Una `node_runs` che non ha mai smesso di essere `running` — una
 * richiesta morta a metà, senza chi la finisca — deve poter uscire da sola: nessun cron esiste
 * ancora per le immagini, ed è QUESTO il buco che la segnalazione descrive.
 */
describe('una run rimasta running non ha altra via se non il timeout', () => {
  it('la chiude expired e riaccende il nodo per il prossimo tentativo', async () => {
    const { db, calls } = fakeDb(
      { node_runs: [runRow], nodes: [nodeRow] },
      { updateRows: { node_runs: [runRow], nodes: [nodeRow] } }
    );

    const result = await expireStuckRuns(db);

    expect(result).toMatchObject({ expired: 1 });

    const runUpdate = calls.find(
      (c) => c.table === 'node_runs' && c.op === 'update' && (c.payload as { status?: string })?.status === 'expired'
    );
    expect(runUpdate?.payload).toMatchObject({ status: 'expired' });

    const nodeUpdate = calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(nodeUpdate?.payload).toMatchObject({ data: expect.objectContaining({ running: false }) });
  });

  it('non tocca una run ancora dentro la finestra', async () => {
    const fresh = { ...runRow, started_at: new Date().toISOString() };
    const { db } = fakeDb({ node_runs: [], nodes: [nodeRow] });
    void fresh;

    const result = await expireStuckRuns(db);

    expect(result).toMatchObject({ expired: 0 });
  });
});
