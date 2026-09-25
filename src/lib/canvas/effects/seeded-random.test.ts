import { describe, expect, it } from 'vitest';
import { mulberry32 } from './seeded-random';

describe('mulberry32', () => {
	it('produces the same sequence for the same seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);

		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
	});

	it('produces a different sequence for a different seed', () => {
		const a = mulberry32(1);
		const b = mulberry32(2);

		expect(a()).not.toBe(b());
	});

	it('stays within [0, 1)', () => {
		const rand = mulberry32(7);

		for (let i = 0; i < 100; i++) {
			const value = rand();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});
