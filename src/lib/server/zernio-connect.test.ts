import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { ZERNIO_API_KEY: 'test-key' } }));

const publisherMock = vi.hoisted(() => ({
  createProfile: vi.fn(),
  accounts: vi.fn()
}));
vi.mock('./publishing', () => ({ publisher: publisherMock }));

const adminMock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabase-admin', () => ({ createAdminClient: () => adminMock }));

const chargeAccountSeatMock = vi.hoisted(() => vi.fn());
vi.mock('./account-billing', () => ({ chargeAccountSeat: chargeAccountSeatMock }));

import { ensureBrandProfile, syncBrandAccounts } from './zernio';

/**
 * `ensureBrandProfile` scrive il puntatore al profilo Zernio del brand su `brands.zernio_profile_id`
 * (migration 20260924_brands_zernio_profile.sql) — è il posto che il pipeline di collegamento
 * conia PRIMA che esista un solo account, quindi un puntatore su `social_accounts` non basterebbe.
 *
 * `syncBrandAccounts` scrive `social_accounts` con le colonne vere: `handle`, non `username`;
 * niente `profile_url` (la colonna non esiste su questo schema).
 */

function brandsQuery(existingRow: Record<string, unknown> | null) {
  const updateCalls: Record<string, unknown>[] = [];
  return {
    updateCalls,
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) })
    }),
    update: (payload: Record<string, unknown>) => {
      updateCalls.push(payload);
      return { eq: async () => ({ error: null }) };
    }
  };
}

describe('ensureBrandProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the existing profile id without minting a new one', async () => {
    const profileId = await ensureBrandProfile({ id: 'b1', name: 'Acme', zernio_profile_id: 'prof-existing' });

    expect(profileId).toBe('prof-existing');
    expect(publisherMock.createProfile).not.toHaveBeenCalled();
  });

  it('mints a profile and persists it on brands.zernio_profile_id', async () => {
    publisherMock.createProfile.mockResolvedValue('prof-new');
    const brands = brandsQuery(null);
    adminMock.from.mockReturnValue(brands);

    const profileId = await ensureBrandProfile({ id: 'b1', name: 'Acme', zernio_profile_id: null });

    expect(profileId).toBe('prof-new');
    expect(adminMock.from).toHaveBeenCalledWith('brands');
    expect(brands.updateCalls).toEqual([{ zernio_profile_id: 'prof-new' }]);
  });
});

describe('syncBrandAccounts', () => {
  beforeEach(() => vi.clearAllMocks());

  function fakeSupabase(opts: { stored?: Record<string, unknown>[]; upsertedId?: string } = {}) {
    const upserts: Record<string, unknown>[] = [];
    const socialQ = {
      upsert: (row: Record<string, unknown>) => {
        upserts.push(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: opts.upsertedId ?? 'row-1' }, error: null })
          })
        };
      },
      select: () => socialQ,
      eq: () => Promise.resolve({ data: opts.stored ?? [] }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) })
    };
    return { from: () => socialQ, upserts };
  }

  it('upserts handle, never username or profile_url', async () => {
    publisherMock.accounts.mockResolvedValue([
      { id: 'acc-1', platform: 'instagram', username: 'demo', displayName: 'Demo', profileUrl: 'https://x', active: true }
    ]);
    const supabase = fakeSupabase();
    chargeAccountSeatMock.mockResolvedValue('charged');

    await syncBrandAccounts(supabase as never, { id: 'b1', org_id: 'org-1', zernio_profile_id: 'prof-1' });

    expect(supabase.upserts).toEqual([
      {
        brand_id: 'b1',
        zernio_account_id: 'acc-1',
        platform: 'instagram',
        handle: 'demo',
        display_name: 'Demo',
        status: 'active'
      }
    ]);
  });

  it('charges the monthly seat fee for every account synced active', async () => {
    publisherMock.accounts.mockResolvedValue([
      { id: 'acc-1', platform: 'instagram', username: 'demo', displayName: 'Demo', profileUrl: null, active: true },
      { id: 'acc-2', platform: 'tiktok', username: 'gone', displayName: null, profileUrl: null, active: false }
    ]);
    const supabase = fakeSupabase({ upsertedId: 'row-1' });
    chargeAccountSeatMock.mockResolvedValue('charged');

    await syncBrandAccounts(supabase as never, { id: 'b1', org_id: 'org-1', zernio_profile_id: 'prof-1' });

    expect(chargeAccountSeatMock).toHaveBeenCalledTimes(1);
    expect(chargeAccountSeatMock).toHaveBeenCalledWith(supabase, { accountId: 'row-1', orgId: 'org-1' });
  });

  it('does nothing without a profile id', async () => {
    const supabase = fakeSupabase();

    await syncBrandAccounts(supabase as never, { id: 'b1', org_id: 'org-1', zernio_profile_id: null });

    expect(publisherMock.accounts).not.toHaveBeenCalled();
    expect(supabase.upserts).toEqual([]);
    expect(chargeAccountSeatMock).not.toHaveBeenCalled();
  });
});
