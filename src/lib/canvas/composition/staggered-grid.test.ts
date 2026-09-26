import { describe, expect, it } from 'vitest';
import { params, transforms } from './staggered-grid';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('staggered grid transforms', () => {
  it('fills a centered geometric grid', () => {
    const result = transforms(12, DEFAULTS, 0);
    const xs = result.map((item) => item.position.x);
    const ys = result.map((item) => item.position.y);

    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });

  it('moves columns at different speeds and closes the loop', () => {
    const start = transforms(12, DEFAULTS, 0);
    const middle = transforms(12, DEFAULTS, 0.25);
    const end = transforms(12, DEFAULTS, 1);

    expect(middle[0].position.y).not.toBeCloseTo(middle[3].position.y);
    for (let index = 0; index < start.length; index++) {
      expect(end[index].position.x).toBeCloseTo(start[index].position.x, 10);
      expect(end[index].position.y).toBeCloseTo(start[index].position.y, 10);
      expect(end[index].opacity).toBeCloseTo(start[index].opacity ?? 1, 10);
    }
  });
});
