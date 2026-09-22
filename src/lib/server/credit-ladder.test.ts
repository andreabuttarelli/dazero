import { describe, expect, it } from 'vitest';
import {
  AI_MARKUP,
  billedCreditsFor,
  CREDIT_LADDER,
  MARGIN_FLOOR,
  marginForRung
} from './credit-ladder';

describe('credit ladder never falls below the margin floor', () => {
  for (const rung of CREDIT_LADDER) {
    it(`$${rung.price} subscription clears the floor in the worst case`, () => {
      // Worst case: the customer spends every credit they bought. No breakage assumption.
      expect(marginForRung(rung.price, rung.creditsSubscription)).toBeGreaterThanOrEqual(
        MARGIN_FLOOR
      );
    });

    it(`$${rung.price} one-time clears the floor in the worst case`, () => {
      expect(marginForRung(rung.price, rung.creditsOneTime)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    });

    it(`$${rung.price} one-time margin is never below its subscription margin`, () => {
      // One-time sells fewer credits per dollar (70:1 vs 100:1), so it must always cost less to
      // honour at the same price — never the other way round.
      expect(marginForRung(rung.price, rung.creditsOneTime)).toBeGreaterThanOrEqual(
        marginForRung(rung.price, rung.creditsSubscription)
      );
    });
  }

  it('the top rung sits exactly on the floor, not below it', () => {
    const top = CREDIT_LADDER[CREDIT_LADDER.length - 1];
    expect(marginForRung(top.price, top.creditsSubscription)).toBeCloseTo(MARGIN_FLOOR, 5);
  });

  it('the first four rungs are a flat 50% margin (no partial discount)', () => {
    for (const rung of CREDIT_LADDER.slice(0, 4)) {
      expect(marginForRung(rung.price, rung.creditsSubscription)).toBeCloseTo(0.5, 5);
    }
  });
});

describe('billedCreditsFor', () => {
  it('matches the anchor: $1 of provider cost bills 200 credits at 100% markup', () => {
    expect(AI_MARKUP).toBe(1.0);
    expect(billedCreditsFor(1)).toBe(200);
  });

  it('$5 of credits cost us $2.50 of provider spend — the user-given anchor', () => {
    const fiveDollarRung = CREDIT_LADDER.find((r) => r.price === 5)!;
    const costUsd = fiveDollarRung.creditsSubscription / 200;
    expect(costUsd).toBeCloseTo(2.5, 5);
  });
});
