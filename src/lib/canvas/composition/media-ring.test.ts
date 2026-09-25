import { describe, expect, it } from 'vitest';
import { params, transforms } from './media-ring';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('media-ring transforms', () => {
	it('distributes media around a ring', () => {
		const result = transforms(8, { ...DEFAULTS, rings: 1, radius: 5, spinSpeed: 0, wave: 0 }, 0);

		expect(result).toHaveLength(8);
		for (const item of result) {
			expect(Math.hypot(item.position.x, item.position.z)).toBeCloseTo(5);
		}
	});

	it('spins and ripples over time', () => {
		const start = transforms(8, { ...DEFAULTS, spinSpeed: 0.5, wave: 2 }, 0);
		const later = transforms(8, { ...DEFAULTS, spinSpeed: 0.5, wave: 2 }, 1);

		expect(start[0].position).not.toEqual(later[0].position);
	});

	it('splits media across stacked rings', () => {
		const result = transforms(12, { ...DEFAULTS, rings: 3, radius: 6, ringGap: 2, spinSpeed: 0, wave: 0 }, 0);
		const heights = new Set(result.map((item) => item.position.y.toFixed(3)));

		expect(heights.size).toBe(3);
	});

	it('turns every card tangent to the ring', () => {
		const result = transforms(4, { ...DEFAULTS, rings: 1, spinSpeed: 0, wave: 0 }, 0);

		for (const item of result) {
			const radius = Math.hypot(item.position.x, item.position.z);
			const normalX = Math.sin(item.rotation.y);
			const normalZ = Math.cos(item.rotation.y);
			const alignment = (normalX * item.position.x + normalZ * item.position.z) / radius;

			expect(alignment).toBeCloseTo(1);
		}
	});
});
