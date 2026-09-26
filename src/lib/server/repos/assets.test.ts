import { describe, expect, it } from 'vitest';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import { findOrCreateImportedAsset, listProjectAssets } from './assets';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';

const row = {
  id: '33333333-3333-3333-3333-333333333333',
  project_id: PROJECT,
  type: 'image',
  url: 'canvas-assets/some/path',
  content: null,
  mime_type: 'image/png',
  bytes: 1024,
  width: 512,
  height: 512,
  duration_s: null,
  source: 'generated',
  source_node_id: '44444444-4444-4444-4444-444444444444',
  created_at: '2026-09-21T00:00:00Z'
};

describe('la libreria di un progetto si legge per org e progetto', () => {
  it('senza filtro non aggiunge un eq su source', async () => {
    const { db, calls } = fakeDb({ assets: [row] });

    await listProjectAssets(db, { orgId: ORG, projectId: PROJECT });

    const filters = filtersOf(calls, 'select');
    expect(filters).toMatchObject({ org_id: ORG, project_id: PROJECT });
    expect(filters).not.toHaveProperty('source');
  });

  it('source: "generated" scopa la query, non solo il risultato', async () => {
    const { db, calls } = fakeDb({ assets: [row] });

    await listProjectAssets(db, { orgId: ORG, projectId: PROJECT, source: 'generated' });

    expect(filtersOf(calls, 'select')).toMatchObject({
      org_id: ORG,
      project_id: PROJECT,
      source: 'generated'
    });
  });

  it('source: "upload" scopa la query sull altro valore', async () => {
    const { db, calls } = fakeDb({ assets: [row] });

    await listProjectAssets(db, { orgId: ORG, projectId: PROJECT, source: 'upload' });

    expect(filtersOf(calls, 'select')).toMatchObject({ source: 'upload' });
  });
});

describe('un file che esiste già fuori dalla tela diventa un asset solo la prima volta', () => {
  it('trova la riga esistente e non ne inserisce una seconda', async () => {
    const { db, calls } = fakeDb({
      assets: [{ ...row, id: 'existing-1', source: 'imported', url: 'https://cdn/logo.png' }]
    });

    const asset = await findOrCreateImportedAsset(db, { orgId: ORG, type: 'image', url: 'https://cdn/logo.png' });

    expect(asset.id).toBe('existing-1');
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('quando non esiste, la inserisce con source: "imported" e project_id null', async () => {
    const { db, calls } = fakeDb({ assets: [] });

    await findOrCreateImportedAsset(db, { orgId: ORG, type: 'image', url: 'https://cdn/logo.png' });

    const insertCall = calls.find((c) => c.op === 'insert');
    expect(insertCall?.payload).toMatchObject({
      org_id: ORG,
      project_id: null,
      source: 'imported',
      url: 'https://cdn/logo.png',
      type: 'image'
    });
  });
});
