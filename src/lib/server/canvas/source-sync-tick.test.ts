import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';

const { syncProductsNode, syncSocialFeedNode } = vi.hoisted(() => ({
  syncProductsNode: vi.fn(),
  syncSocialFeedNode: vi.fn()
}));

vi.mock('./products-sync', () => ({ syncProductsNode }));
vi.mock('./social-feed-sync', () => ({ syncSocialFeedNode }));

import { tickSourceSync, SOURCE_SYNC_STALE_MS } from './source-sync-tick';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';

beforeEach(() => vi.clearAllMocks());

const HOUR = 60 * 60_000;

function productsNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    org_id: ORG,
    project_id: PROJECT,
    type: 'products',
    data: { type: 'shopify', url: 'https://shop.example.com', ...overrides }
  };
}

function feedNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    org_id: ORG,
    project_id: PROJECT,
    type: 'social_account_feed',
    data: { platform: 'instagram', handle: 'brand', ...overrides }
  };
}

describe('tickSourceSync — quali nodi sono scaduti', () => {
  it('un nodo mai sincronizzato (synced_at assente) è sempre scaduto', async () => {
    syncProductsNode.mockResolvedValue({ ok: true, synced: 3, after: null });
    const { db } = fakeDb({ nodes: [productsNode('n1')] });

    const out = await tickSourceSync(db);

    expect(out.checked).toBe(1);
    expect(syncProductsNode).toHaveBeenCalledTimes(1);
  });

  it('un nodo sincronizzato da meno della soglia non viene toccato', async () => {
    const recent = new Date(Date.now() - HOUR).toISOString();
    const { db } = fakeDb({ nodes: [productsNode('n1', { synced_at: recent, sync_status: 'done' })] });

    const out = await tickSourceSync(db);

    expect(out.checked).toBe(0);
    expect(syncProductsNode).not.toHaveBeenCalled();
  });

  it('un nodo sincronizzato oltre la soglia (sei ore) torna scaduto', async () => {
    const stale = new Date(Date.now() - SOURCE_SYNC_STALE_MS - HOUR).toISOString();
    syncProductsNode.mockResolvedValue({ ok: true, synced: 1, after: null });
    const { db } = fakeDb({ nodes: [productsNode('n1', { synced_at: stale, sync_status: 'done' })] });

    const out = await tickSourceSync(db);

    expect(out.checked).toBe(1);
    expect(syncProductsNode).toHaveBeenCalledTimes(1);
  });

  it('un nodo già in corso (sync_status running) non riparte da capo', async () => {
    const { db } = fakeDb({ nodes: [productsNode('n1', { sync_status: 'running' })] });

    const out = await tickSourceSync(db);

    expect(out.checked).toBe(0);
    expect(syncProductsNode).not.toHaveBeenCalled();
  });
});

describe('tickSourceSync — smista per tipo', () => {
  it('un nodo products chiama syncProductsNode, non syncSocialFeedNode', async () => {
    syncProductsNode.mockResolvedValue({ ok: true, synced: 2, after: null });
    const { db } = fakeDb({ nodes: [productsNode('n1')] });

    await tickSourceSync(db);

    expect(syncProductsNode).toHaveBeenCalledTimes(1);
    expect(syncSocialFeedNode).not.toHaveBeenCalled();
  });

  it('un nodo social_account_feed chiama syncSocialFeedNode, non syncProductsNode', async () => {
    syncSocialFeedNode.mockResolvedValue({ ok: true, synced: 5 });
    const { db } = fakeDb({ nodes: [feedNode('n1')] });

    await tickSourceSync(db);

    expect(syncSocialFeedNode).toHaveBeenCalledTimes(1);
    expect(syncProductsNode).not.toHaveBeenCalled();
  });
});

describe('tickSourceSync — scrive lo stato leggibile sul nodo', () => {
  it('un giro riuscito scrive sync_status done e synced_count', async () => {
    syncProductsNode.mockResolvedValue({ ok: true, synced: 7, after: '2' });
    const { db, calls } = fakeDb({ nodes: [productsNode('n1')] });

    await tickSourceSync(db);

    const update = calls.find((c) => c.table === 'nodes' && c.op === 'update')!;
    const payload = update.payload as { data: Record<string, unknown> };
    expect(payload.data).toMatchObject({ sync_status: 'done', synced_count: 7, after: '2' });
  });

  it('un giro fallito scrive sync_status failed con il motivo leggibile, mai un token muto', async () => {
    syncProductsNode.mockResolvedValue({ ok: false, error: 'store_unreachable: /products.json returned 404' });
    const { db, calls } = fakeDb({ nodes: [productsNode('n1')] });

    const out = await tickSourceSync(db);

    expect(out.failed).toBe(1);
    const update = calls.find((c) => c.table === 'nodes' && c.op === 'update')!;
    const payload = update.payload as { data: Record<string, unknown> };
    expect(payload.data.sync_status).toBe('failed');
    expect(payload.data.sync_error).toBe('store_unreachable: /products.json returned 404');
  });

  it('un nodo products senza url non chiama il fetcher e scrive un errore leggibile', async () => {
    const { db, calls } = fakeDb({ nodes: [productsNode('n1', { url: '' })] });

    const out = await tickSourceSync(db);

    expect(syncProductsNode).not.toHaveBeenCalled();
    expect(out.failed).toBe(1);
    const update = calls.find((c) => c.table === 'nodes' && c.op === 'update')!;
    const payload = update.payload as { data: Record<string, unknown> };
    expect(payload.data.sync_error).toMatch(/invalid_url/);
  });
});
