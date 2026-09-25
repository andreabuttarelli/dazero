import { describe, expect, it } from 'vitest';
import { params, transforms } from './media-cloud';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('media-cloud transforms', () => {
	it('places media deterministically inside the configured volume', () => {
		const first = transforms(12, { ...DEFAULTS, spreadX: 4, spreadY: 6, spreadZ: 8, drift: 0, seed: 42 }, 0);
		const second = transforms(12, { ...DEFAULTS, spreadX: 4, spreadY: 6, spreadZ: 8, drift: 0, seed: 42 }, 0);

		expect(first).toEqual(second);
		for (const item of first) {
			expect(Math.abs(item.position.x)).toBeLessThanOrEqual(2);
			expect(Math.abs(item.position.y)).toBeLessThanOrEqual(3);
			expect(Math.abs(item.position.z)).toBeLessThanOrEqual(4);
		}
	});

	it('drifts without changing the seeded arrangement', () => {
		const start = transforms(5, DEFAULTS, 0);
		const later = transforms(5, DEFAULTS, 1);

		expect(start[0].position).not.toEqual(later[0].position);
		expect(transforms(5, DEFAULTS, 1)).toEqual(later);
	});
});
