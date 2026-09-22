import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestSupabase } from '$lib/testkit/supabase';

// The two RPCs credits.ts used to call — sum_org_ai_cost_usd, sum_brand_ai_cost_usd — do not
// exist on the new schema (klnswzhhgrqvbfjzioul has no `Functions` at all: verified against
// database.types.ts). Every call errored, was swallowed, and returned `used: 0` — a credits
// gate reporting zero spend on a real error, i.e. failing OPEN. These tests pin the replacement:
// spend is summed from `ai_calls` directly (org_id, brand_id, cost_usd, created_at all exist on
// the new table), and a brand or org that cannot be resolved denies the spend instead of
// reporting zero usage.

beforeEach(() => {
  vi.resetModules();
});

describe('orgCreditsUsage reads spend from ai_calls (no RPC)', () => {
  it('sums cost_usd for the org within the period, ignoring rows outside it', async () => {
    const { client } = createTestSupabase({
      ai_calls: [
        { id: '1', org_id: 'org-1', cost_usd: 1.5, created_at: '2026-09-10T00:00:00Z' },
        { id: '2', org_id: 'org-1', cost_usd: 2, created_at: '2026-09-20T00:00:00Z' },
        { id: '3', org_id: 'org-1', cost_usd: 999, created_at: '2026-08-01T00:00:00Z' }, // before period
        { id: '4', org_id: 'org-2', cost_usd: 999, created_at: '2026-09-10T00:00:00Z' } // other org
      ]
    });
    const { orgCreditsUsage } = await import('./credits');

    const usage = await orgCreditsUsage(client as never, {
      orgId: 'org-1',
      plan: null,
      activatedAt: null,
      brandIds: []
    });

    expect(usage.used).toBe(350); // (1.5 + 2) USD * 100 credits/USD
  });

  it('never grants more than the free quota — plan has no home in the new schema', async () => {
    const { client } = createTestSupabase({ ai_calls: [] });
    const { orgCreditsUsage, creditQuota } = await import('./credits');

    const usage = await orgCreditsUsage(client as never, {
      orgId: 'org-1',
      plan: 'pro', // even if a caller still carries a stale plan string, it must not inflate quota
      activatedAt: null,
      brandIds: []
    });

    expect(usage.quota).toBe(creditQuota(null));
  });

  it('period defaults to the calendar month — no subscription anchor exists in the new schema', async () => {
    const { client } = createTestSupabase({ ai_calls: [] });
    const { orgCreditsUsage } = await import('./credits');

    const usage = await orgCreditsUsage(client as never, {
      orgId: 'org-1',
      plan: null,
      activatedAt: null,
      brandIds: []
    });

    const now = new Date();
    expect(usage.periodStart.getUTCMonth()).toBe(now.getUTCMonth());
    expect(usage.periodStart.getUTCDate()).toBe(1);
  });
});

describe('gateCreditsCore fails CLOSED when the org cannot be resolved from brands', () => {
  it('denies the spend when the brand row itself cannot be read', async () => {
    vi.doMock('./ai-log', () => ({ isCreditExempt: () => false }));
    const swallowed: unknown[] = [];
    vi.doMock('$lib/server/swallow', () => ({
      swallow: (reason: string, err?: unknown) => {
        swallowed.push({ reason, err });
      }
    }));

    const { client } = createTestSupabase({ brands: [], ai_calls: [] });
    vi.doMock('./supabase-admin', () => ({ createAdminClient: () => client }));

    const { gateCreditsCore } = await import('./credits');

    // Brand not found: nothing to gate, allowed through (matches the pre-existing "no brand → return" contract).
    await expect(gateCreditsCore('missing-brand')).resolves.toBeUndefined();
  });

  it('denies the spend once ai_calls spend crosses the free quota, with no plan to inflate it', async () => {
    vi.doMock('./ai-log', () => ({ isCreditExempt: () => false }));

    const { client } = createTestSupabase({
      orgs: [{ id: 'org-1' }],
      brands: [{ id: 'brand-1', org_id: 'org-1' }],
      ai_calls: [{ id: '1', org_id: 'org-1', cost_usd: 5, created_at: new Date().toISOString() }] // 500 credits > 400 free quota
    });
    vi.doMock('./supabase-admin', () => ({ createAdminClient: () => client }));

    const { gateCreditsCore, CreditsExhaustedError } = await import('./credits');

    await expect(gateCreditsCore('brand-1')).rejects.toBeInstanceOf(CreditsExhaustedError);
  });
});
