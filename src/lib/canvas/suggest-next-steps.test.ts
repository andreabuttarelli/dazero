import { describe, expect, it } from 'vitest';
import { rankedFallback, suggestNextSteps, NEXT_STEP_CONFIDENCE_THRESHOLD } from './suggest-next-steps';
import type { Decide } from './decide';

describe('rankedFallback', () => {
  it('ranks actions by historical frequency, highest first', () => {
    const ranked = rankedFallback('image', { 'write-caption': 8, 'animate-into-video': 2 });
    expect(ranked[0].action.id).toBe('write-caption');
    expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence);
  });

  it('spreads confidence evenly when no history exists', () => {
    const ranked = rankedFallback('image', {});
    const distinct = new Set(ranked.map((r) => r.confidence));
    expect(distinct.size).toBe(1);
  });

  it('returns nothing for a node type with no actions', () => {
    expect(rankedFallback('ads', {})).toEqual([]);
  });
});

describe('suggestNextSteps', () => {
  it('uses only the rules fallback when no decide port is given', async () => {
    const suggestions = await suggestNextSteps('image', { 'write-caption': 10 }, null);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].action.id).toBe('write-caption');
  });

  it('filters out suggestions below the confidence threshold', async () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    void many;
    const suggestions = await suggestNextSteps('image', {}, null);
    for (const s of suggestions) {
      expect(s.confidence).toBeGreaterThanOrEqual(NEXT_STEP_CONFIDENCE_THRESHOLD);
    }
  });

  it('re-ranks using the decide port when the chosen action is in the fallback set', async () => {
    const decide: Decide = async () => ({ kind: 'choose-one', value: 'animate-into-video', confidence: 0.95 });
    const suggestions = await suggestNextSteps('image', {}, decide);
    const top = suggestions.find((s) => s.action.id === 'animate-into-video');
    expect(top?.confidence).toBe(0.95);
  });

  it('ignores a Jev answer outside the fallback-validated action set', async () => {
    const decide: Decide = async () => ({ kind: 'choose-one', value: 'not-a-real-action', confidence: 0.99 });
    const withoutJev = await suggestNextSteps('image', {}, null);
    const withJev = await suggestNextSteps('image', {}, decide);
    expect(withJev.map((s) => s.action.id).sort()).toEqual(withoutJev.map((s) => s.action.id).sort());
  });

  it('falls back to the rules ranking when decide returns null', async () => {
    const decide: Decide = async () => null;
    const suggestions = await suggestNextSteps('image', { 'write-caption': 10 }, decide);
    expect(suggestions[0].action.id).toBe('write-caption');
  });
});
