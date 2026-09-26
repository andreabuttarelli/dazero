import { describe, expect, it, vi, beforeEach } from 'vitest';

const { fetchStoreProductsPage, upsertNodeProducts } = vi.hoisted(() => ({
  fetchStoreProductsPage: vi.fn(),
  upsertNodeProducts: vi.fn()
}));

vi.mock('$lib/server/store-fetch', () => ({ fetchStoreProductsPage }));
vi.mock('$lib/server/repos/products', () => ({ upsertNodeProducts }));

import { syncProductsNode } from './products-sync';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const NODE = '33333333-3333-3333-3333-333333333333';

beforeEach(() => vi.clearAllMocks());

describe('syncProductsNode', () => {
  it('quando la pagina fallisce, torna l\'errore letto dal fetcher e non scrive niente', async () => {
    fetchStoreProductsPage.mockResolvedValue({ ok: false, error: 'store_unreachable: /products.json returned 404' });

    const out = await syncProductsNode(null as never, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'shopify',
      storeUrl: 'https://dead-shop.example.com',
      limit: 50,
      after: null,
      onlyFirstPhoto: false
    });

    expect(out).toEqual({ ok: false, error: 'store_unreachable: /products.json returned 404' });
    expect(upsertNodeProducts).not.toHaveBeenCalled();
  });

  it('quando la pagina riesce, scrive col repository e torna quanti e la pagina successiva', async () => {
    fetchStoreProductsPage.mockResolvedValue({ ok: true, products: [{ externalId: '1' }, { externalId: '2' }], after: '2' });
    upsertNodeProducts.mockResolvedValue(2);

    const out = await syncProductsNode({} as never, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'shopify',
      storeUrl: 'https://shop.example.com',
      limit: 2,
      after: null,
      onlyFirstPhoto: false
    });

    expect(out).toEqual({ ok: true, synced: 2, after: '2' });
    expect(upsertNodeProducts).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ orgId: ORG, projectId: PROJECT, nodeId: NODE, platform: 'shopify' })
    );
  });
});
