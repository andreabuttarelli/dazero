import { describe, expect, it } from 'vitest';
import { overflows } from './scroll-guard';

describe('un area scrolla solo quando ha davvero più contenuto di quanto mostri', () => {
  it('scrollHeight più alto di clientHeight vuol dire che c è dell altro sotto', () => {
    expect(overflows({ scrollHeight: 400, clientHeight: 220 })).toBe(true);
  });

  it('scrollHeight uguale a clientHeight vuol dire che tutto è già visibile', () => {
    expect(overflows({ scrollHeight: 220, clientHeight: 220 })).toBe(false);
  });

  it('scrollHeight più basso non è mai possibile ma non deve dare un overflow finto', () => {
    expect(overflows({ scrollHeight: 100, clientHeight: 220 })).toBe(false);
  });
});
