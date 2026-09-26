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

	it('keeps the default spiral centered and fully inside the social frame', () => {
		const result = transforms(7, DEFAULTS, 0.37);
		const centerX = result.reduce((sum, item) => sum + item.position.x, 0) / result.length;

		expect(centerX).toBeCloseTo(0, 5);
		expect(Math.max(...result.map((item) => Math.abs(item.position.x)))).toBeLessThanOrEqual(3);
		expect(Math.max(...result.map((item) => Math.abs(item.position.y)))).toBeLessThanOrEqual(2.5);
		expect(Math.max(...result.map((item) => Math.abs(item.rotation.y)))).toBeLessThan(0.25);
	});
});
