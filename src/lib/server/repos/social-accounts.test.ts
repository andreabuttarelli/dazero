import { describe, expect, it } from 'vitest';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import { listBrandAccounts } from './social-accounts';

const ORG = 'org-1';
const BRAND = 'brand-1';

const row = {
  id: 'acc-1',
  org_id: ORG,
  brand_id: BRAND,
  platform: 'instagram',
  handle: 'demo',
  display_name: 'Demo IG',
  avatar_url: null,
  status: 'connected'
};

describe('listBrandAccounts', () => {
  it('scopa per org e brand', async () => {
    const { db, calls } = fakeDb({ social_accounts: [row] });

    await listBrandAccounts(db, { orgId: ORG, brandId: BRAND });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, brand_id: BRAND });
  });

  it('legge platform/handle/status, non un token', async () => {
    const { db } = fakeDb({ social_accounts: [row] });

    const accounts = await listBrandAccounts(db, { orgId: ORG, brandId: BRAND });

    expect(accounts).toEqual([
      { id: 'acc-1', platform: 'instagram', handle: 'demo', displayName: 'Demo IG', avatarUrl: null, status: 'connected' }
    ]);
  });
});
