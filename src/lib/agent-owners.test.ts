import { describe, expect, it } from 'vitest';
import { JOB_OWNERS } from './agent-owners';
import { ROSTER_JOB_KEYS } from './server/job-roster';

describe('agent-owners', () => {
  it('JOB_OWNERS è totale: ogni routine del roster appartiene a un agente della squadra', () => {
    expect(Object.keys(JOB_OWNERS).sort()).toEqual([...ROSTER_JOB_KEYS].sort());
    // La mappa concordata: analyst legge e dirige, web presidia il sito.
    for (const k of ['analytics_review', 'weekly_recap', 'market_refs', 'strategy_review'] as const) {
      expect(JOB_OWNERS[k], k).toBe('analyst');
    }
    for (const k of ['library'] as const) {
      expect(JOB_OWNERS[k], k).toBe('web');
    }
  });
});
