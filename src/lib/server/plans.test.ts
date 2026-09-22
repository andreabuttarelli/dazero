import { describe, it, expect, vi } from 'vitest';
import { postQuota, videoCap, mixCostUsd, VIDEO_SHARE, batchWeeks } from './plans';
import { PLAN_WEEKS } from '$lib/plans';
import { creditQuota } from './credits';

// The quotas are sized against a MEASURED cost per post, so they are only correct while the two
// stay in sync. This is the guard: raise POST_QUOTAS (or the unit costs) past what the plan's
// credits can pay for and it fails here, not on a customer's invoice.
//
// Post production is ~33% of a plan's credits in practice — the rest is blog, SEO/GEO
// audits, strategy and chat. Credits are billed at 100 = $1.
const POST_BUDGET_SHARE = 0.33;
const CREDITS_PER_USD = 100;

describe('pricing display capacity matches server quotas', () => {
  it('postsPerMonth on each card equals POST_QUOTAS', async () => {
    const { PLANS } = await import('$lib/plans');
    for (const p of PLANS) {
      expect(p.postsPerMonth).toBe(postQuota(p.key));
    }
  });
});

describe('post quotas fit the credit envelope', () => {
  for (const plan of ['go', 'starter', 'pro']) {
    it(`${plan}: a month of the target mix stays inside its post-production budget`, () => {
      const budgetUsd = (creditQuota(plan) / CREDITS_PER_USD) * POST_BUDGET_SHARE;
      expect(mixCostUsd(plan)).toBeLessThanOrEqual(budgetUsd);
    });
  }

  it('an unknown plan falls back to the SMALLEST quota, never to unlimited', () => {
    expect(postQuota('enterprise-2029')).toBe(postQuota('go'));
    expect(postQuota(null)).toBe(postQuota('go'));
  });

  it('the video cap is derived from the quota, so the two cannot drift apart', () => {
    expect(videoCap('go')).toBe(Math.round(postQuota('go') * VIDEO_SHARE));
    expect(videoCap('starter')).toBe(Math.round(postQuota('starter') * VIDEO_SHARE));
    expect(videoCap('pro')).toBe(Math.round(postQuota('pro') * VIDEO_SHARE));
    // Whatever the numbers become, video must stay the DOMINANT format — that is the whole point
    // of trading post count for format.
    expect(videoCap('go')).toBeGreaterThan(postQuota('go') * 0.3);
    expect(videoCap('starter')).toBeGreaterThan(postQuota('starter') * 0.3);
  });
});

describe('isExportOnlyPlan', () => {
  it('is true for Go — a paid tier that sells zero connected accounts', async () => {
    const { isExportOnlyPlan } = await import('./plans');
    expect(isExportOnlyPlan('go')).toBe(true);
  });

  it('is false for the tiers that include social accounts', async () => {
    const { isExportOnlyPlan } = await import('./plans');
    expect(isExportOnlyPlan('starter')).toBe(false);
    expect(isExportOnlyPlan('pro')).toBe(false);
    expect(isExportOnlyPlan('scale')).toBe(false);
  });

  it('is false for free/trial — no paid promise to keep, so the produce gate still applies', async () => {
    const { isExportOnlyPlan } = await import('./plans');
    expect(isExportOnlyPlan(null)).toBe(false);
    expect(isExportOnlyPlan(undefined)).toBe(false);
    expect(isExportOnlyPlan('')).toBe(false);
    expect(isExportOnlyPlan('nonexistent')).toBe(false);
  });

  it('stays derived from ACCOUNT_LIMITS, so a future export tier inherits the behaviour', async () => {
    const { isExportOnlyPlan, accountLimit, ACCOUNT_LIMITS } = await import('./plans');
    for (const [plan, limit] of Object.entries(ACCOUNT_LIMITS)) {
      expect(accountLimit(plan)).toBe(limit);
      expect(isExportOnlyPlan(plan)).toBe(limit === 0);
    }
  });
});

// Un batch di una settimana sola costringeva l'utente ad approvare quattro volte al mese, e
// impediva a una serie di costruire un arco fra un episodio e il successivo. Due settimane sono il
// default; quattro — l'intero ciclo in un colpo — sono una cosa che si vende.
describe('batchWeeks', () => {
  it('due settimane per tutti', () => {
    expect(batchWeeks('go')).toBe(2);
    expect(batchWeeks('starter')).toBe(2);
    expect(batchWeeks(null)).toBe(2);
  });

  it('il pro può pianificare il ciclo intero', () => {
    expect(batchWeeks('pro', 4)).toBe(4);
  });

  it('sotto il pro la richiesta di quattro viene riportata a due', () => {
    expect(batchWeeks('starter', 4)).toBe(2);
  });

  it('non si va mai oltre il ciclo del piano editoriale', () => {
    expect(batchWeeks('pro', 99)).toBe(PLAN_WEEKS);
  });

  it('meno di una settimana non è un batch', () => {
    expect(batchWeeks('pro', 0)).toBe(2);
  });
});

