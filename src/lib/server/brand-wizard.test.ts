import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestSupabase } from '$lib/testkit/supabase';

vi.mock('$lib/server/brand-analysis', () => ({
  runBrandAnalysis: vi.fn()
}));
vi.mock('$lib/server/credits', async () => {
  const actual = await vi.importActual<typeof import('$lib/server/credits')>('$lib/server/credits');
  return { ...actual, gateOrgCredits: vi.fn() };
});

import {
  analyzeWizardSite,
  composeWizardContent,
  createBrandFromWizard,
  type WizardDraft,
  type WizardProduct
} from './brand-wizard';
import { runBrandAnalysis } from '$lib/server/brand-analysis';
import { gateOrgCredits } from '$lib/server/credits';

const DRAFT: WizardDraft = {
  target: 'Small coffee shops in Northern Italy',
  colours: ['#1a2b3c', '#ffffff'],
  brandHandles: [{ platform: 'instagram', handle: 'acme' }],
  competitorHandles: [{ platform: 'instagram', handle: 'rival' }]
};

describe('composeWizardContent: il markdown che il wizard scrive in brands.content', () => {
  it('porta il target come testo libero', () => {
    const md = composeWizardContent(DRAFT);
    expect(md).toContain('Small coffee shops in Northern Italy');
  });

  it('porta ogni colore come token che tokenizeChips riconosce', () => {
    const md = composeWizardContent(DRAFT);
    expect(md).toContain('#1a2b3c');
    expect(md).toContain('#ffffff');
  });

  it('porta gli handle del brand nel formato platform:@handle', () => {
    const md = composeWizardContent(DRAFT);
    expect(md).toContain('instagram:@acme');
  });

  it('porta gli handle dei concorrenti, in una sezione separata da quelli del brand', () => {
    const md = composeWizardContent(DRAFT);
    expect(md).toContain('instagram:@rival');
    const brandSection = md.indexOf('instagram:@acme');
    const competitorSection = md.indexOf('instagram:@rival');
    expect(brandSection).toBeGreaterThan(-1);
    expect(competitorSection).toBeGreaterThan(brandSection);
  });

  it('senza colori o handle non scrive quelle sezioni', () => {
    const md = composeWizardContent({ target: 'Chiunque', colours: [], brandHandles: [], competitorHandles: [] });
    expect(md).not.toContain('## Colours');
    expect(md).not.toContain('## Social handles');
    expect(md).not.toContain('## Competitors');
  });

  it('senza niente affatto torna una stringa vuota', () => {
    expect(composeWizardContent({ target: '', colours: [], brandHandles: [], competitorHandles: [] })).toBe('');
  });
});

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';

const PRODUCT: WizardProduct = {
  externalId: 'p1',
  handle: 'widget',
  title: 'Widget',
  description: 'A widget',
  price: 9.9,
  currency: 'EUR',
  url: 'https://shop.example.com/widget',
  images: [],
  available: true,
  included: true
};

describe('createBrandFromWizard: approva scrive il brand, i prodotti scelti, e prende il progetto se ne è senza', () => {
  it('crea il brand con lo slug atteso e content dal wizard', async () => {
    const kit = createTestSupabase({ brands: [], products: [], projects: [{ id: PROJECT, org_id: ORG, brand_id: null }] });

    const result = await createBrandFromWizard(kit.client, {
      orgId: ORG,
      projectId: PROJECT,
      projectHasBrand: false,
      name: 'Acme Coffee',
      website: 'https://acme.example',
      shortDescription: 'Coffee for everyone',
      content: '## Target\n\nEveryone',
      logoUrl: null,
      products: [],
      productsPlatform: null
    });

    expect(result.slug).toBe('acme-coffee');
    const brand = kit.tables.get('brands')?.find((b) => b.id === result.id);
    expect(brand).toMatchObject({ org_id: ORG, name: 'Acme Coffee', content: '## Target\n\nEveryone' });
  });

  it('un secondo brand con lo stesso nome nella stessa org prende uno slug diverso', async () => {
    const kit = createTestSupabase({
      brands: [],
      products: [],
      projects: [{ id: PROJECT, org_id: ORG, brand_id: null }]
    });
    kit.failNext('brands', 'duplicate key value violates unique constraint "brands_org_id_slug_key"', 'insert');

    const result = await createBrandFromWizard(kit.client, {
      orgId: ORG,
      projectId: PROJECT,
      projectHasBrand: true,
      name: 'Acme Coffee',
      website: null,
      shortDescription: null,
      content: '',
      logoUrl: null,
      products: [],
      productsPlatform: null
    });

    expect(result.slug).toBe('acme-coffee-2');
  });

  it('scrive solo i prodotti inclusi, con node_id assente', async () => {
    const kit = createTestSupabase({ brands: [], products: [], projects: [{ id: PROJECT, org_id: ORG, brand_id: null }] });

    const result = await createBrandFromWizard(kit.client, {
      orgId: ORG,
      projectId: PROJECT,
      projectHasBrand: true,
      name: 'Acme',
      website: null,
      shortDescription: null,
      content: '',
      logoUrl: null,
      products: [PRODUCT, { ...PRODUCT, externalId: 'p2', included: false }],
      productsPlatform: 'shopify'
    });

    const rows = kit.tables.get('products') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brand_id: result.id, external_id: 'p1', platform: 'shopify' });
  });

  it('quando il progetto è senza brand, lo assegna; quando ne ha già uno, lo lascia stare', async () => {
    const withoutBrand = createTestSupabase({ brands: [], products: [], projects: [{ id: PROJECT, org_id: ORG, brand_id: null }] });
    const created = await createBrandFromWizard(withoutBrand.client, {
      orgId: ORG,
      projectId: PROJECT,
      projectHasBrand: false,
      name: 'Acme',
      website: null,
      shortDescription: null,
      content: '',
      logoUrl: null,
      products: [],
      productsPlatform: null
    });
    const project = withoutBrand.tables.get('projects')?.find((p) => p.id === PROJECT);
    expect(project?.brand_id).toBe(created.id);

    const withBrand = createTestSupabase({ brands: [], products: [], projects: [{ id: PROJECT, org_id: ORG, brand_id: 'existing' }] });
    await createBrandFromWizard(withBrand.client, {
      orgId: ORG,
      projectId: PROJECT,
      projectHasBrand: true,
      name: 'Acme',
      website: null,
      shortDescription: null,
      content: '',
      logoUrl: null,
      products: [],
      productsPlatform: null
    });
    const untouched = withBrand.tables.get('projects')?.find((p) => p.id === PROJECT);
    expect(untouched?.brand_id).toBe('existing');
  });
});

describe('analyzeWizardSite: legge il sito una volta, e prepara tutto quel che i passi dopo mostrano', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passa dal cancello dei crediti PRIMA di leggere il sito', async () => {
    vi.mocked(gateOrgCredits).mockResolvedValue(undefined);
    vi.mocked(runBrandAnalysis).mockResolvedValue({
      name: 'Acme',
      url: 'https://acme.example',
      category: 'coffee',
      about: 'Coffee shop',
      brand_style: 'warm',
      target_audience: 'Coffee lovers',
      brand_colors: ['#1a2b3c'],
      products: [],
      social_handles: [{ platform: 'instagram', handle: 'acme', url: 'https://instagram.com/acme' }]
    } as never);

    await analyzeWizardSite(ORG, 'https://acme.example');

    expect(gateOrgCredits).toHaveBeenCalledWith(ORG);
    expect(runBrandAnalysis).toHaveBeenCalled();
  });

  it('un cancello che rifiuta non arriva nemmeno a leggere il sito', async () => {
    const { CreditsExhaustedError } = await import('$lib/server/credits');
    vi.mocked(gateOrgCredits).mockRejectedValue(new CreditsExhaustedError({} as never));

    await expect(analyzeWizardSite(ORG, 'https://acme.example')).rejects.toThrow(CreditsExhaustedError);
    expect(runBrandAnalysis).not.toHaveBeenCalled();
  });

  it('compone già il content suggerito e i prodotti trovati come bozza, tutti inclusi di default', async () => {
    vi.mocked(gateOrgCredits).mockResolvedValue(undefined);
    vi.mocked(runBrandAnalysis).mockResolvedValue({
      name: 'Acme',
      url: 'https://acme.example',
      category: 'coffee',
      about: 'Coffee shop',
      brand_style: 'warm',
      target_audience: 'Coffee lovers in Milan',
      brand_colors: ['#1a2b3c', '#ffffff'],
      products: [{ name: 'Espresso blend', description: '250g bag' }],
      social_handles: [{ platform: 'instagram', handle: 'acme', url: 'https://instagram.com/acme' }]
    } as never);

    const result = await analyzeWizardSite(ORG, 'https://acme.example');

    expect(result.suggestedContent).toContain('Coffee lovers in Milan');
    expect(result.suggestedContent).toContain('#1a2b3c');
    expect(result.suggestedContent).toContain('instagram:@acme');
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ title: 'Espresso blend', included: true });
  });
});
