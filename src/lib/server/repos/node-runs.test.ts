import { describe, expect, it } from 'vitest';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import { claimRun, completeRun, createRun, failRun, listNodeRuns } from './node-runs';

const ORG = '11111111-1111-1111-1111-111111111111';
const NODE = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const ASSET = '44444444-4444-4444-4444-444444444444';

const row = {
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
  started_at: '2026-09-21T00:00:00Z',
  finished_at: null,
  actor_kind: 'user',
  actor_id: null
};

describe('una run nasce già in corso, col giro congelato', () => {
  it('porta org, nodo, prompt, modello e parametri', async () => {
    const { db, calls } = fakeDb({ node_runs: [row] });

    await createRun(db, {
      orgId: ORG,
      nodeId: NODE,
      prompt: 'a cat',
      model: 'openai/gpt',
      params: { aspectRatio: '1:1' },
      actorKind: 'user',
      actorId: 'user'
    });

    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.table).toBe('node_runs');
    expect(insert.payload).toMatchObject({
      org_id: ORG,
      node_id: NODE,
      prompt: 'a cat',
      model: 'openai/gpt',
      status: 'running'
    });
    expect(filtersOf(calls, 'insert')).toEqual({});
  });

  it('la lista è scopata su org e nodo', async () => {
    const { db, calls } = fakeDb({ node_runs: [row] });

    await listNodeRuns(db, { orgId: ORG, nodeId: NODE });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, node_id: NODE });
  });
});

describe('il claim è atomico: chi arriva secondo non finalizza', () => {
  it('passa running → finishing solo su una riga ancora running', async () => {
    const { db, calls } = fakeDb({ node_runs: [row] });

    const claimed = await claimRun(db, { orgId: ORG, runId: RUN });

    expect(claimed).not.toBeNull();
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.payload).toMatchObject({ status: 'finishing' });
    expect(update.payload).not.toHaveProperty('attempts');
    expect(filtersOf(calls, 'update')).toMatchObject({ id: RUN, org_id: ORG, status: 'running' });
  });

  it('zero righe torna null, non un successo silenzioso', async () => {
    const { db } = fakeDb({ node_runs: [] });

    expect(await claimRun(db, { orgId: ORG, runId: RUN })).toBeNull();
  });
});

describe('la chiusura porta l asset e il costo', () => {
  it('completeRun scrive done, l uscita e il prezzo', async () => {
    const { db, calls } = fakeDb({ node_runs: [row] });

    await completeRun(db, { orgId: ORG, runId: RUN, assetId: ASSET, costUsd: 0.12 });

    expect(calls.find((c) => c.op === 'update')!.payload).toMatchObject({
      status: 'done',
      output_asset_id: ASSET,
      cost_usd: 0.12
    });
  });

  it('failRun scrive failed e il motivo', async () => {
    const { db, calls } = fakeDb({ node_runs: [row] });

    await failRun(db, { orgId: ORG, runId: RUN, error: 'render_failed' });

    expect(calls.find((c) => c.op === 'update')!.payload).toMatchObject({
      status: 'failed',
      error: 'render_failed'
    });
  });
});
