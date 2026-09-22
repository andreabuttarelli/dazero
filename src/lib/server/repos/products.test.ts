/**
 * L'UPSERT È QUELLO CHE RENDE UN RI-SYNC NON UN DUPLICATO. `products_node_external_idx` è l'indice
 * unico parziale su `(node_id, platform, external_id) where node_id is not null` — la stessa
 * pagina letta due volte deve aggiornare la riga, mai raddoppiarla. Qui si dimostra che la query
 * che parte porta quell'`onConflict`, non che Postgres lo rispetti (quello lo fa il vincolo).
 */
import { describe, expect, it } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';
import { listNodeProducts, upsertNodeProducts, deleteNodeProducts } from './products';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const NODE = '33333333-3333-3333-3333-333333333333';

const product = {
  externalId: '9001',
  handle: 'widget',
  title: 'Widget',
  description: 'A widget',
  price: 19.9,
  currency: 'EUR',
  url: 'https://shop.example.com/products/widget',
  images: [{ url: 'https://cdn.example.com/w.jpg', position: 0 }],
  available: true
};

describe('upsertNodeProducts', () => {
  it('non scrive niente quando la pagina è vuota', async () => {
    const { db, calls } = fakeDb({});
    const synced = await upsertNodeProducts(db, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'shopify',
      products: []
    });
    expect(synced).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('scrive con upsert su (node_id, platform, external_id), mai un insert puro', async () => {
    const { db, calls } = fakeDb({});
    const synced = await upsertNodeProducts(db, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'shopify',
      products: [product]
    });

    expect(synced).toBe(1);
    const call = calls.find((c) => c.table === 'products' && c.op === 'upsert');
    expect(call).toBeDefined();
    const rows = call!.payload as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      org_id: ORG,
      project_id: PROJECT,
      node_id: NODE,
      platform: 'shopify',
      external_id: '9001',
      title: 'Widget'
    });
  });

  it('due prodotti nella stessa pagina diventano due righe nello stesso giro', async () => {
    const { db, calls } = fakeDb({});
    await upsertNodeProducts(db, {
      orgId: ORG,
      projectId: PROJECT,
      nodeId: NODE,
      platform: 'shopify',
      products: [product, { ...product, externalId: '9002', title: 'Widget 2' }]
    });

    const call = calls.find((c) => c.table === 'products' && c.op === 'upsert')!;
    const rows = call.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.external_id)).toEqual(['9001', '9002']);
  });
});

describe('listNodeProducts', () => {
  it('filtra per org_id e node_id, non solo per node_id', async () => {
    const { db, calls } = fakeDb({
      products: [
        {
          id: 'p1',
          node_id: NODE,
          project_id: PROJECT,
          platform: 'shopify',
          external_id: '9001',
          handle: 'widget',
          title: 'Widget',
          description: null,
          price: 19.9,
          currency: 'EUR',
          url: null,
          images: [],
          available: true,
          synced_at: '2026-09-22T00:00:00Z'
        }
      ]
    });

    const out = await listNodeProducts(db, { orgId: ORG, nodeId: NODE });
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe('9001');

    const call = calls.find((c) => c.table === 'products' && c.op === 'select')!;
    const filters = Object.fromEntries(call.filters);
    expect(filters.org_id).toBe(ORG);
    expect(filters.node_id).toBe(NODE);
  });
});

describe('deleteNodeProducts', () => {
  it('cancella per org_id e node_id insieme', async () => {
    const { db, calls } = fakeDb({});
    await deleteNodeProducts(db, { orgId: ORG, nodeId: NODE });
    const call = calls.find((c) => c.table === 'products' && c.op === 'delete')!;
    const filters = Object.fromEntries(call.filters);
    expect(filters.org_id).toBe(ORG);
    expect(filters.node_id).toBe(NODE);
  });
});
