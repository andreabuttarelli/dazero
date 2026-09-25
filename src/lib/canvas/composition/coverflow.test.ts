import { describe, expect, it } from 'vitest';
import { params, transforms } from './coverflow';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('coverflow transforms', () => {
	it('centers one card and angles the side cards', () => {
		const result = transforms(6, { ...DEFAULTS, speed: 0 }, 0);
		const center = result[0];

		expect(center.position.x).toBeCloseTo(0);
		expect(center.rotation.y).toBeCloseTo(0);
		expect(Math.abs(result[1].rotation.y)).toBeGreaterThan(0);
		expect(center.scale.x).toBeGreaterThan(result[1].scale.x);
		expect(Math.abs(result[1].position.y - center.position.y)).toBeLessThan(0.5);
	});

	it('moves every card through the center and closes the carousel loop', () => {
		const count = 6;

		for (let index = 0; index < count; index++) {
			const phase = index / count;
			expect(transforms(count, DEFAULTS, phase)[index].position.x).toBeCloseTo(0);
		}

		expect(transforms(count, DEFAULTS, 1)).toEqual(transforms(count, DEFAULTS, 0));
	});

	it('hides a card while it wraps behind the carousel', () => {
		const beforeWrap = transforms(6, DEFAULTS, 0.49)[0];
		const afterWrap = transforms(6, DEFAULTS, 0.51)[0];

		expect(beforeWrap.opacity).toBeLessThan(0.1);
		expect(afterWrap.opacity).toBeLessThan(0.1);
	});
});
