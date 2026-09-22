import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTestSupabase } from '$lib/testkit/supabase';
import { creditQuota } from './credits';

// credits.ts caches the resolved org for 5 minutes at module scope. Without a reset each test
// would answer from the previous one's seed — and quietly pass for it.
beforeEach(() => {
  vi.resetModules();
});

// The pool is the ORG's, not the brand's: spend sums over every brand under the org, from
// `ai_calls` directly — the new schema has no `organizations`, no `credit_grants`, no
// `org_usage`, and no RPCs (sum_org_ai_cost_usd, org_billing_period, brand_billing_period all
// gone). Quota is always the free-tier quota: `orgs`/`brands` carry no plan column, so there is
// nothing to read a paid quota from — this is a genuine gap (see TYPES_AUDIT.md / the task
// report), not something these tests paper over.

const ORG = 'org-1';

describe('getCreditsUsage, org-scoped', () => {
  it('reads the free-tier quota — there is no plan column to read a paid one from', async () => {
    const { client } = createTestSupabase({
      orgs: [{ id: ORG }],
      brands: [{ id: 'brand-a', org_id: ORG }],
      ai_calls: []
    });
    const { getCreditsUsage } = await import('./credits');

    const usage = await getCreditsUsage(client as never, {
      id: 'brand-a',
      plan: null,
      activated_at: null,
      status: 'active'
    });

    expect(usage.quota).toBe(creditQuota(null));
  });

  it('spends from one shared pool: ai_calls rows of every brand in the org count once, by org_id', async () => {
    const { client, calls } = createTestSupabase({
      orgs: [{ id: ORG }],
      brands: [{ id: 'brand-a', org_id: ORG }],
      ai_calls: [
        { id: '1', org_id: ORG, cost_usd: 3, created_at: new Date().toISOString() },
        { id: '2', org_id: 'org-elsewhere', cost_usd: 999, created_at: new Date().toISOString() }
      ]
    });
    const { getCreditsUsage } = await import('./credits');

    const usage = await getCreditsUsage(client as never, {
      id: 'brand-a',
      plan: null,
      activated_at: null,
      status: 'active'
    });

    expect(calls.some((c) => c.table === 'ai_calls' && c.filters.some((f) => f.col === 'org_id'))).toBe(true);
    expect(usage.used).toBe(300); // 3 USD × 100 credits, the other org's spend never counted
  });

  it('falls back to the brand alone when the brand cannot be resolved to an org', async () => {
    const { client } = createTestSupabase({
      orgs: [],
      brands: [],
      ai_calls: [{ id: '1', org_id: ORG, brand_id: 'brand-a', cost_usd: 1, created_at: new Date().toISOString() }]
    });
    const { getCreditsUsage } = await import('./credits');

    const usage = await getCreditsUsage(client as never, {
      id: 'brand-a',
      plan: null,
      activated_at: null,
      status: 'active'
    });

    expect(usage.used).toBe(100); // 1 USD × 100 credits, read by brand_id since no org resolved
  });

  it('the billing period is always the calendar month — no subscription anchor exists anymore', async () => {
    const { client } = createTestSupabase({ orgs: [{ id: ORG }], brands: [{ id: 'brand-a', org_id: ORG }], ai_calls: [] });
    const { getCreditsUsage } = await import('./credits');

    const usage = await getCreditsUsage(client as never, {
      id: 'brand-a',
      plan: null,
      activated_at: null,
      status: 'active'
    });

    const now = new Date();
    expect(usage.periodStart.getUTCMonth()).toBe(now.getUTCMonth());
    expect(usage.periodStart.getUTCDate()).toBe(1);
  });
});

describe('gateCreditsCore, org-scoped cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('two brands of the same org share one pool reading', async () => {
    // The cache keys on the org: the second brand must not pay for the same sum all over again.
    const { client, calls } = createTestSupabase({
      orgs: [{ id: ORG }],
      brands: [
        { id: 'brand-a', org_id: ORG },
        { id: 'brand-b', org_id: ORG }
      ],
      ai_calls: []
    });
    vi.doMock('./supabase-admin', () => ({ createAdminClient: () => client }));
    vi.doMock('./ai-log', () => ({ isCreditExempt: () => false }));

    const { gateCreditsCore } = await import('./credits');
    await gateCreditsCore('brand-a');
    await gateCreditsCore('brand-b');

    expect(calls.filter((c) => c.table === 'ai_calls')).toHaveLength(1);
  });
});
