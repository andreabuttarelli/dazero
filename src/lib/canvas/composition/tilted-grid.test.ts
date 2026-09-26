import { describe, expect, it } from 'vitest';
import { params, transforms } from './tilted-grid';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('tilted-grid transforms', () => {
	it('returns empty for count 0', () => {
		expect(transforms(0, DEFAULTS, 0)).toEqual([]);
	});

	it('places items along columns and rows using gap', () => {
		const result = transforms(4, { ...DEFAULTS, columns: 2, gapX: 2, gapY: 2, tiltX: 0, tiltY: 0, tiltZ: 0, scrollSpeed: 0 }, 0);

		expect(result).toHaveLength(4);
		expect(result[0].position.x).toBeCloseTo(-1);
		expect(result[1].position.x).toBeCloseTo(1);
		expect(result[0].position.y).toBeCloseTo(result[2].position.y + 2);
	});

	it('tilt rotates every item the same way', () => {
		const result = transforms(3, { ...DEFAULTS, tiltX: 15, tiltY: 10, tiltZ: 5, waveDepth: 0 }, 0);

		for (const transform of result) {
			expect(transform.rotation.x).toBeCloseTo((15 * Math.PI) / 180);
			expect(transform.rotation.y).toBeCloseTo((10 * Math.PI) / 180);
			expect(transform.rotation.z).toBeCloseTo((5 * Math.PI) / 180);
		}
	});

	it('scroll moves positions between t=0 and t=1', () => {
		const at0 = transforms(4, { ...DEFAULTS, scrollSpeed: 1, scrollDirection: 'vertical' }, 0);
		const at1 = transforms(4, { ...DEFAULTS, scrollSpeed: 1, scrollDirection: 'vertical' }, 1);

		expect(at0[0].position.y).not.toBeCloseTo(at1[0].position.y);
	});

	it('creates a travelling depth wave across the grid', () => {
		const result = transforms(6, { ...DEFAULTS, columns: 3, waveDepth: 2, waveSpeed: 1 }, 0.4);
		const depths = new Set(result.map((item) => item.position.z.toFixed(3)));

		expect(depths.size).toBeGreaterThan(2);
	});

	it('is deterministic for the same inputs', () => {
		const first = transforms(5, DEFAULTS, 2.5);
		const second = transforms(5, DEFAULTS, 2.5);

		expect(first).toEqual(second);
	});

	it('clamps params outside their declared range', () => {
		const result = transforms(1, { ...DEFAULTS, columns: -5 }, 0);

		expect(result).toHaveLength(1);
	});
});
