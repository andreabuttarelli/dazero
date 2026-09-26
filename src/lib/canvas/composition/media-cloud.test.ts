import { describe, expect, it } from 'vitest';
import { params, transforms } from './media-cloud';

const DEFAULTS = Object.fromEntries(params.map((param) => [param.name, param.default]));

describe('media-cloud transforms', () => {
	it('forms a centered layered field with readable cards', () => {
		const items = transforms(7, DEFAULTS, 0.25);
		const center = items.reduce(
			(total, item) => ({ x: total.x + item.position.x, y: total.y + item.position.y }),
			{ x: 0, y: 0 }
		);

		expect(Math.abs(center.x / items.length)).toBeLessThan(0.75);
		expect(Math.abs(center.y / items.length)).toBeLessThan(0.75);
		expect(new Set(items.map((item) => item.position.z.toFixed(1))).size).toBeGreaterThanOrEqual(3);

		for (const item of items) {
			expect(Math.abs(item.position.x)).toBeLessThanOrEqual(3.5);
			expect(Math.abs(item.position.y)).toBeLessThanOrEqual(3.5);
			expect(Math.abs(item.rotation.x)).toBeLessThanOrEqual(0.12);
			expect(Math.abs(item.rotation.y)).toBeLessThanOrEqual(0.12);
			expect(Math.abs(item.rotation.z)).toBeLessThanOrEqual(0.12);
		}
	});

	it('moves every card through a closed continuous cycle', () => {
		const start = transforms(5, DEFAULTS, 0);
		const quarter = transforms(5, DEFAULTS, 0.25);
		const end = transforms(5, DEFAULTS, 1);

		for (let index = 0; index < start.length; index++) {
			expect(quarter[index].position).not.toEqual(start[index].position);
			expect(end[index].position.x).toBeCloseTo(start[index].position.x, 10);
			expect(end[index].position.y).toBeCloseTo(start[index].position.y, 10);
			expect(end[index].position.z).toBeCloseTo(start[index].position.z, 10);
		}
	});

	it('keeps the seeded choreography deterministic', () => {
		expect(transforms(7, DEFAULTS, 0.4)).toEqual(transforms(7, DEFAULTS, 0.4));
		expect(transforms(7, { ...DEFAULTS, seed: 9 }, 0.4)).not.toEqual(transforms(7, DEFAULTS, 0.4));
	});
});
