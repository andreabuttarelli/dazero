import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { createTestSupabase } from '$lib/testkit/supabase';

/**
 * UNA FUNZIONE NON ESISTE FINCHÉ NON È COLLEGATA (CLAUDE.md). Queste azioni sono quelle che
 * `+page.svelte` chiama coi suoi form (`?/analyze`, `?/syncProducts`, `?/create`) — non funzioni
 * isolate mai raggiunte. `listMemberships` è mockata al confine di `repos/orgs.ts` (lo stesso
 * confine che `tenancy/entry.test.ts` usa): un JOIN `orgs!inner(...)` che il fake Supabase non
 * emula, non tenancy da riprovare qui. Tutto il resto — `findProjectForUser`, l'INSERT del
 * brand, l'assegnazione al progetto — gira su un client vero (`createTestSupabase`).
 *
 * IL PERCORSO CHE QUESTO FILE PROVA, FILE PER FILE:
 *   +page.svelte (form action="?/analyze", poi "?/create")
 *     → +page.server.ts::actions.analyze  → brand-wizard.ts::analyzeWizardSite
 *         → brand-analysis.ts::runBrandAnalysis (mockata: è l'HTTP verso il sito, il confine esterno)
 *     → +page.server.ts::actions.create   → brand-wizard.ts::createBrandFromWizard
 *         → repos/products.ts::insertBrandProducts, repos/projects.ts::setProjectBrand
 */
vi.mock('$lib/server/repos/orgs', () => ({
  listMemberships: vi.fn()
}));
vi.mock('$lib/server/brand-analysis', () => ({
  runBrandAnalysis: vi.fn(),
  isShopifySite: vi.fn(() => false),
  isWooCommerceSite: vi.fn(() => false),
  fetchShopifyProducts: vi.fn(async () => []),
  fetchWooCommerceProducts: vi.fn(async () => [])
}));
vi.mock('$lib/server/tool-guard', () => ({
  safeFetchUrl: vi.fn(async () => ({ body: '<html></html>' }))
}));
vi.mock('$lib/server/credits', async () => {
  const actual = await vi.importActual<typeof import('$lib/server/credits')>('$lib/server/credits');
  return { ...actual, gateOrgCredits: vi.fn(async () => undefined) };
});

const { actions } = await import('./+page.server');
const { listMemberships } = await import('$lib/server/repos/orgs');
const { runBrandAnalysis } = await import('$lib/server/brand-analysis');

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const PROJECT = '33333333-3333-3333-3333-333333333333';

function seed(overrides: Record<string, unknown[]> = {}) {
  return createTestSupabase({
    projects: [{ id: PROJECT, org_id: ORG, name: 'Untitled', slug: 'untitled', brand_id: null, archived_at: null }],
    brands: [],
    products: [],
    ...overrides
  });
}

function event(fields: Record<string, string>, db: unknown) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return {
    request: { formData: async () => fd },
    params: { projectId: PROJECT },
    locals: {
      safeGetSession: async () => ({ session: { access_token: 'jwt' }, user: { id: USER } }),
      db: async () => db
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMemberships).mockResolvedValue([{ org: { id: ORG, name: 'Acme', slug: 'acme' }, role: 'owner' }]);
});

describe('actions.analyze: dal form al motore di analisi vero', () => {
  it('chiama runBrandAnalysis e torna un content già composto con i chip', async () => {
    vi.mocked(runBrandAnalysis).mockResolvedValue({
      name: 'Acme Coffee',
      url: 'https://acme.example',
      category: 'coffee',
      about: 'A coffee shop',
      brand_style: 'warm',
      target_audience: 'Coffee lovers in Milan',
      brand_colors: ['#1a2b3c'],
      products: [{ name: 'Espresso', description: '250g' }],
      social_handles: [{ platform: 'instagram', handle: 'acme', url: 'https://instagram.com/acme' }]
    } as never);

    const { client: db } = seed();
    const result = (await (actions.analyze as (e: unknown) => Promise<unknown>)(
      event({ url: 'https://acme.example' }, db)
    )) as { analyzed: boolean; suggestedContent: string; products: Array<{ title: string }> };

    expect(runBrandAnalysis).toHaveBeenCalled();
    expect(result.analyzed).toBe(true);
    expect(result.suggestedContent).toContain('instagram:@acme');
    expect(result.products).toHaveLength(1);
  });

  it('senza url torna un errore 400, senza chiamare l\'analisi', async () => {
    const { client: db } = seed();
    const outcome = (await (actions.analyze as (e: unknown) => Promise<unknown>)(event({ url: '' }, db))) as {
      status: number;
      data: { error: string };
    };
    expect(outcome.status).toBe(400);
    expect(runBrandAnalysis).not.toHaveBeenCalled();
  });
});

describe('actions.create: dal form al brand vero, i prodotti veri, il progetto assegnato', () => {
  it('crea il brand, lo lega al progetto senza brand, e reindirizza alla sua pagina', async () => {
    const { client: db, tables } = seed();

    const outcome = await (actions.create as (e: unknown) => Promise<unknown>)(
      event(
        {
          name: 'Acme Coffee',
          website: 'https://acme.example',
          shortDescription: 'Coffee for everyone',
          content: '## Target\n\nEveryone',
          logoUrl: '',
          productsPlatform: '',
          products: '[]'
        },
        db
      )
    ).catch((e) => e);

    expect(isRedirect(outcome)).toBe(true);
    const brand = tables.get('brands')?.[0];
    expect(brand).toMatchObject({ org_id: ORG, name: 'Acme Coffee', content: '## Target\n\nEveryone' });

    const project = tables.get('projects')?.find((p) => p.id === PROJECT);
    expect(project?.brand_id).toBe(brand?.id);
    expect((outcome as { location: string }).location).toBe(`/p/${PROJECT}/brands/${brand?.slug}`);
  });

  it('scrive solo i prodotti passati, per quel brand, senza node_id', async () => {
    const { client: db, tables } = seed();
    const products = [
      {
        externalId: 'p1',
        handle: null,
        title: 'Espresso',
        description: '250g',
        price: null,
        currency: null,
        url: null,
        images: [],
        available: true,
        included: true
      }
    ];

    await (actions.create as (e: unknown) => Promise<unknown>)(
      event(
        {
          name: 'Acme',
          website: '',
          shortDescription: '',
          content: '',
          logoUrl: '',
          productsPlatform: 'shopify',
          products: JSON.stringify(products)
        },
        db
      )
    ).catch(() => {});

    const rows = tables.get('products') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: 'shopify', external_id: 'p1', title: 'Espresso' });
    expect(rows[0].node_id).toBeUndefined();
  });

  it('senza nome torna un errore 400, senza scrivere niente', async () => {
    const { client: db, tables } = seed();
    const outcome = (await (actions.create as (e: unknown) => Promise<unknown>)(
      event({ name: '', website: '', shortDescription: '', content: '', logoUrl: '', productsPlatform: '', products: '[]' }, db)
    )) as { status: number };
    expect(outcome.status).toBe(400);
    expect(tables.get('brands')).toHaveLength(0);
  });
});
