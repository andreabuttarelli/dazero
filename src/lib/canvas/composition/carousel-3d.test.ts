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

	it('hides every card whose media face points away from the camera', () => {
		const result = transforms(6, { ...DEFAULTS, rotationSpeed: 0 }, 0);
		const back = result[3];

		expect(back.scale.x).toBeCloseTo(Number(DEFAULTS.backScale));
		expect(back.opacity).toBe(0);
		expect(result.filter((item) => item.position.z < 0).every((item) => item.opacity === 0)).toBe(true);
	});

	it('rotation speed moves the ring between t=0 and t=1', () => {
		const at0 = transforms(6, { ...DEFAULTS, rotationSpeed: 1 }, 0);
		const at1 = transforms(6, { ...DEFAULTS, rotationSpeed: 1 }, 0.3);

		expect(at0[0].position.x).not.toBeCloseTo(at1[0].position.x);
	});

	it('moves every card through the front and closes one orbit', () => {
		const count = 7;

		for (let index = 0; index < count; index++) {
			const phase = index / count;
			const item = transforms(count, { ...DEFAULTS, rotationSpeed: 1 }, phase)[index];
			expect(item.position.x).toBeCloseTo(0);
			expect(item.position.z).toBeCloseTo(Number(DEFAULTS.depth));
		}

		expect(transforms(count, { ...DEFAULTS, rotationSpeed: 1 }, 1)).toEqual(
			transforms(count, { ...DEFAULTS, rotationSpeed: 1 }, 0)
		);
	});

	it('aligns card faces with their radial position', () => {
		const result = transforms(7, { ...DEFAULTS, rotationSpeed: 0 }, 0);

		for (const item of result) {
			const normalX = Math.sin(item.rotation.y);
			const normalZ = Math.cos(item.rotation.y);
			const radius = Math.hypot(item.position.x / Number(DEFAULTS.radius), item.position.z / Number(DEFAULTS.depth));
			const alignment = (normalX * item.position.x / Number(DEFAULTS.radius) + normalZ * item.position.z / Number(DEFAULTS.depth)) / radius;
			expect(alignment).toBeCloseTo(1);
		}
	});

	it('fans cards vertically instead of keeping a flat ring', () => {
		const result = transforms(8, { ...DEFAULTS, verticalWave: 2 }, 0.4);
		const heights = new Set(result.map((item) => item.position.y.toFixed(3)));

		expect(heights.size).toBeGreaterThan(2);
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
