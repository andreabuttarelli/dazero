import { describe, expect, it, vi } from 'vitest';
import { buildCalendarData } from './calendar-load';

const ORG = 'org-1';
const BRAND = 'brand-1';

const brand = { id: BRAND, name: 'Demo', slug: 'demo', website: null, shortDescription: null, logoUrl: null };

const accounts = [
  { id: 'acc-ig', platform: 'instagram' as const, handle: 'demo', displayName: 'Demo IG', avatarUrl: null, status: 'connected' }
];

const posts = [
  {
    id: 'post-1',
    brandId: BRAND,
    title: null,
    caption: 'Ciao',
    perPlatform: null,
    media: [{ assetId: 'a1', order: 0, role: 'primary' }],
    linkUrl: null,
    status: 'ready' as const,
    createdAt: '2026-09-01T00:00:00Z'
  }
];

function repos(overrides: { deliveryStatus?: ReturnType<typeof vi.fn> } = {}) {
  return {
    listOrgBrands: vi.fn().mockResolvedValue([brand]),
    listBrandAccounts: vi.fn().mockResolvedValue(accounts),
    listPosts: vi.fn().mockResolvedValue(posts),
    deliveryStatus: overrides.deliveryStatus ?? vi.fn().mockResolvedValue([])
  };
}

describe('buildCalendarData: nessun brand sul progetto', () => {
  it('offre la scelta invece di 400', async () => {
    const r = repos();
    const data = await buildCalendarData(r, { orgId: ORG, brandId: null, db: {} as never, publisher: {} as never });

    expect(data).toEqual({ brand: null, brands: [brand], accounts: [], posts: [] });
    expect(r.listPosts).not.toHaveBeenCalled();
  });
});

describe('buildCalendarData: progetto con brand', () => {
  it('carica gli account e i post di QUEL brand, con lo stato di consegna per post', async () => {
    const r = repos({ deliveryStatus: vi.fn().mockResolvedValue([{ accountId: 'acc-ig', platform: 'instagram', status: 'scheduled', url: null, error: null }]) });

    const data = await buildCalendarData(r, { orgId: ORG, brandId: BRAND, db: {} as never, publisher: {} as never });

    expect(data.brand).toEqual(brand);
    expect(data.accounts).toEqual(accounts);
    expect(data.posts).toEqual([
      { ...posts[0], deliveries: [{ accountId: 'acc-ig', platform: 'instagram', status: 'scheduled', url: null, error: null }] }
    ]);
  });

  it('un post senza puntatore ha deliveries vuoto, senza chiedere niente a Zernio in più del necessario', async () => {
    const r = repos();

    const data = await buildCalendarData(r, { orgId: ORG, brandId: BRAND, db: {} as never, publisher: {} as never });

    expect(data.posts[0].deliveries).toEqual([]);
  });
});
