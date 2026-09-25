import { describe, expect, it } from 'vitest';
import { params, transforms } from './vertical-flow';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('vertical-flow transforms', () => {
	it('builds a vertical sequence with a dominant center card', () => {
		const result = transforms(6, { ...DEFAULTS, speed: 0 }, 0);
		const center = result[0];

		expect(center.position.y).toBeCloseTo(0);
		expect(center.scale.x).toBeGreaterThan(result[1].scale.x);
		expect(center.position.z).toBeGreaterThan(result[1].position.z);
		expect(Math.abs(result[1].position.x - center.position.x)).toBeLessThan(0.5);
	});

	it('scrolls every card through the center and closes the vertical loop', () => {
		const count = 6;

		for (let index = 0; index < count; index++) {
			const phase = index / count;
			expect(transforms(count, DEFAULTS, phase)[index].position.y).toBeCloseTo(0);
		}

		expect(transforms(count, DEFAULTS, 1)).toEqual(transforms(count, DEFAULTS, 0));
	});

	it('hides a card while it wraps behind the vertical stack', () => {
		const beforeWrap = transforms(6, DEFAULTS, 0.49)[0];
		const afterWrap = transforms(6, DEFAULTS, 0.51)[0];

		expect(beforeWrap.opacity).toBeLessThan(0.1);
		expect(afterWrap.opacity).toBeLessThan(0.1);
	});
});
