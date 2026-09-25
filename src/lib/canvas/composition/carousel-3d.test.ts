import { describe, expect, it } from 'vitest';
import { params, transforms } from './carousel-3d';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('carousel-3d transforms', () => {
	it('returns empty for count 0', () => {
		expect(transforms(0, DEFAULTS, 0)).toEqual([]);
	});

	it('front item has front scale and is nearest to camera on z', () => {
		const result = transforms(6, { ...DEFAULTS, rotationSpeed: 0 }, 0);
		const front = result[0];
		const zValues = result.map((item) => item.position.z);

		expect(front.scale.x).toBeCloseTo(Number(DEFAULTS.frontScale));
		expect(front.position.z).toBe(Math.max(...zValues));
	});

	it('back items use back scale', () => {
		const result = transforms(6, { ...DEFAULTS, rotationSpeed: 0 }, 0);
		const back = result[3];

		expect(back.scale.x).toBeCloseTo(Number(DEFAULTS.backScale));
	});

	it('rotation speed moves the ring between t=0 and t=1', () => {
		const at0 = transforms(6, { ...DEFAULTS, rotationSpeed: 1 }, 0);
		const at1 = transforms(6, { ...DEFAULTS, rotationSpeed: 1 }, 0.3);

		expect(at0[0].position.x).not.toBeCloseTo(at1[0].position.x);
	});

	it('is deterministic for the same inputs', () => {
		const first = transforms(5, DEFAULTS, 1.25);
		const second = transforms(5, DEFAULTS, 1.25);

		expect(first).toEqual(second);
	});

	it('clamps params outside their declared range', () => {
		const result = transforms(3, { ...DEFAULTS, radius: -100 }, 0);

		expect(result).toHaveLength(3);
	});
});
