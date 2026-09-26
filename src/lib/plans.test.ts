import { describe, it, expect } from 'vitest';
import {
  isPlanKey,
  isPaidPlan,
  canConnectSocials,
  hasSocialPublishing,
  hasAds,
  hasMotionVideo4k,
  hasFullChatContext,
  CHAT_CONTEXT_CAP_TOKENS,
  visiblePlans,
  planByKey,
  PLANS,
  videosFromCredits,
  VIDEO_COST_USD_HD,
  VIDEO_COST_CREDITS
} from './plans';

describe('Go plan helpers', () => {
  it('recognises go as a plan key and a paid tier', () => {
    expect(isPlanKey('go')).toBe(true);
    expect(isPaidPlan('go')).toBe(true);
  });

  it('blocks Zernio connects on Go', () => {
    expect(hasSocialPublishing('go')).toBe(false);
    expect(canConnectSocials('go', 'active')).toBe(false);
  });

  it('unlocks Meta & Google Ads from Starter up (not Go/Free)', () => {
    expect(hasAds(null)).toBe(false);
    expect(hasAds('go')).toBe(false);
    expect(hasAds('starter')).toBe(true);
    expect(hasAds('pro')).toBe(true);
    expect(hasAds('scale')).toBe(true);
    expect(planByKey('starter').highlights.some((h) => /Meta|& Google Ads/i.test(h))).toBe(true);
    expect(planByKey('go').highlights.some((h) => /Meta|& Google Ads/i.test(h))).toBe(false);
  });

  it('gives the full chat context window to Starter and up, caps Free/Go', () => {
    expect(hasFullChatContext(null)).toBe(false);
    expect(hasFullChatContext('go')).toBe(false);
    expect(hasFullChatContext('starter')).toBe(true);
    expect(hasFullChatContext('pro')).toBe(true);
    expect(hasFullChatContext('scale')).toBe(true);
    expect(CHAT_CONTEXT_CAP_TOKENS).toBe(256_000);
  });

  it('unlocks 4K Motion video encode on Pro (and legacy scale)', () => {
    expect(hasMotionVideo4k(null)).toBe(false);
    expect(hasMotionVideo4k('go')).toBe(false);
    expect(hasMotionVideo4k('starter')).toBe(false);
    expect(hasMotionVideo4k('pro')).toBe(true);
    expect(hasMotionVideo4k('scale')).toBe(true);
    expect(planByKey('pro').highlights.some((h) => /4K images \/ videos/i.test(h))).toBe(true);
    expect(planByKey('starter').highlights.some((h) => /4K/i.test(h))).toBe(false);
    expect(planByKey('go').highlights.some((h) => /4K/i.test(h))).toBe(false);
  });

  it('keeps pricing cards to a short highlight list', () => {
    for (const p of PLANS) {
      expect(p.highlights.length).toBeGreaterThanOrEqual(4);
      expect(p.highlights.length).toBeLessThanOrEqual(6);
    }
  });

  it('keeps en.json plan card copy in sync with PLANS highlights', async () => {
    const en = (await import('$lib/i18n/locales/en.json')).default as {
      pricing: { plans: Record<string, { tagline: string; highlights: string }> };
    };
    for (const p of PLANS) {
      const loc = en.pricing.plans[p.key];
      expect(loc?.tagline).toBe(p.tagline);
      const bullets = loc.highlights.split('|').map((s) => s.trim()).filter(Boolean);
      expect(bullets).toEqual(p.highlights);
    }
  });


  it('blocks connects with no plan', () => {
    expect(hasSocialPublishing(null)).toBe(false);
    expect(canConnectSocials(null, 'trial')).toBe(false);
  });

  it('still allows connects on Starter/Pro when active', () => {
    expect(canConnectSocials('starter', 'active')).toBe(true);
    expect(canConnectSocials('pro', 'active')).toBe(true);
    expect(canConnectSocials('starter', 'trial')).toBe(false);
  });

  it('hides Go from pricing when the flag is off', () => {
    expect(visiblePlans(false).map((p) => p.key)).toEqual(['starter', 'pro']);
    expect(visiblePlans(true).map((p) => p.key)).toEqual(['go', 'starter', 'pro']);
  });

  it('defaults planByKey to Pro', () => {
    expect(planByKey(null).key).toBe('pro');
    expect(planByKey('go').name).toBe('Go');
    expect(planByKey('go').m).toBe(25);
    expect(planByKey('go').mUsd).toBe(29);
  });

  it('estimates HD videos as plan credits ÷ ($0.38 × 100)', () => {
    expect(VIDEO_COST_USD_HD).toBe(0.38);
    expect(VIDEO_COST_CREDITS).toBe(38);
    // Go 2100 → 55, Starter 5500 → 144, Pro 12000 → 315
    expect(videosFromCredits(2100)).toBe(55);
    expect(videosFromCredits(5500)).toBe(144);
    expect(videosFromCredits(12000)).toBe(315);
    for (const key of ['go', 'starter', 'pro'] as const) {
      const p = planByKey(key);
      expect(videosFromCredits(p.credits)).toBe(Math.floor(p.credits / VIDEO_COST_CREDITS));
    }
  });

  // Il "valore API" accanto ai crediti è stato rimosso: a listino pieno 100 crediti = $1, quindi
  // i numeri di marketing (€50 sui 2100 crediti del Go) erano falsi, e quelli veri dicono che il
  // cliente paga più del valore che riceve. Questo test è la lapide: i piani espongono la
  // dotazione di crediti e basta, e nessuno rimette una conversione in euro per abitudine.
  it('sells the credit allowance, never a euro value of somebody else API list price', () => {
    for (const key of ['go', 'starter', 'pro'] as const) {
      expect(planByKey(key).credits).toBeGreaterThan(0);
    }
    for (const p of PLANS) {
      expect(Object.keys(p).filter((k) => /^apiValue/.test(k))).toEqual([]);
    }
  });
});
