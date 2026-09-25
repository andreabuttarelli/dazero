import { describe, expect, it } from 'vitest';
import { params, transforms } from './helix';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('helix transforms', () => {
	it('winds media through height and radius', () => {
		const result = transforms(7, { ...DEFAULTS, radius: 4, height: 12, turns: 2, spinSpeed: 0 }, 0);

		expect(result[0].position.y).toBeCloseTo(-6);
		expect(result[6].position.y).toBeCloseTo(6);
		for (const item of result) {
			expect(Math.hypot(item.position.x, item.position.z)).toBeCloseTo(4);
		}
	});

	it('pulses cards along the spiral', () => {
		const result = transforms(8, { ...DEFAULTS, pulse: 0.5 }, 0.3);
		const scales = new Set(result.map((item) => item.scale.x.toFixed(3)));

		expect(scales.size).toBeGreaterThan(2);
	});
});
