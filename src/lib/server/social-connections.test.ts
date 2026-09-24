import { describe, expect, it, vi } from 'vitest';
import { socialConnections } from './social-connections';
import { ACCOUNT_SEAT_CREDITS } from './credit-ladder';

/**
 * Non ci sono più piani: collegare un account è gated dal saldo crediti dell'org, non da
 * `brands.plan`/`brands.status` (colonne che sullo schema nuovo non esistono — schema-drift-check.mjs).
 * `canConnect` è vero quando l'org può permettersi ALMENO un canone mensile in più di quelli che
 * ha già; `slots.limit` è quanti account l'org può sostenere ORA con il saldo che ha, non un tetto
 * di piano.
 */

function fakeSupabase(accounts: Record<string, unknown>[], balance: number) {
  const socialQ = {
    select: () => socialQ,
    eq: () => socialQ,
    order: async () => ({ data: accounts })
  };
  return {
    from: (table: string) => {
      if (table === 'social_accounts') return socialQ;
      throw new Error(`unexpected table ${table}`);
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'org_credit_balance') throw new Error(`unexpected rpc ${fn}`);
      return { data: balance, error: null };
    })
  };
}

const BRAND = { id: 'brand-1', org_id: 'org-1' };

describe('socialConnections', () => {
  it('can connect when the org can afford one more seat', async () => {
    const supabase = fakeSupabase([], ACCOUNT_SEAT_CREDITS);

    const state = await socialConnections(supabase as never, BRAND);

    expect(state.canConnect).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('org_credit_balance', { _org_id: 'org-1' });
  });

  it('cannot connect when the balance is short of one seat', async () => {
    const supabase = fakeSupabase([], ACCOUNT_SEAT_CREDITS - 1);

    const state = await socialConnections(supabase as never, BRAND);

    expect(state.canConnect).toBe(false);
    expect(state.slots).toEqual({ used: 0, limit: 0 });
  });

  it('slots.limit grows with the accounts already paid for, not a plan cap', async () => {
    const active = { platform: 'instagram', handle: 'a', display_name: null, status: 'active', connected_at: '2026-01-01' };
    const supabase = fakeSupabase([active], ACCOUNT_SEAT_CREDITS * 2);

    const state = await socialConnections(supabase as never, BRAND);

    expect(state.slots).toEqual({ used: 1, limit: 3 });
    expect(state.canConnect).toBe(true);
  });

  it('a broken account still counts toward used seats already paid for', async () => {
    const expired = { platform: 'tiktok', handle: 'a', display_name: null, status: 'expired', connected_at: '2026-01-01' };
    const supabase = fakeSupabase([expired], 0);

    const state = await socialConnections(supabase as never, BRAND);

    expect(state.broken).toEqual(['tiktok']);
    expect(state.slots.used).toBe(0);
  });

  it('maps handle to username and leaves profile_url null — the real columns on social_accounts', async () => {
    const account = {
      platform: 'Instagram',
      handle: 'demo.brand',
      display_name: 'Demo Brand',
      status: 'active',
      connected_at: '2026-08-01T10:00:00.000Z'
    };
    const supabase = fakeSupabase([account], ACCOUNT_SEAT_CREDITS);

    const state = await socialConnections(supabase as never, BRAND);

    expect(state.accounts).toEqual([
      {
        platform: 'instagram',
        username: 'demo.brand',
        display_name: 'Demo Brand',
        profile_url: null,
        status: 'active',
        connected_at: '2026-08-01T10:00:00.000Z'
      }
    ]);
  });
});
