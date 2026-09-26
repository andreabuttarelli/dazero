import { describe, expect, it } from 'vitest';
import { apply } from './noise';
import { makePixels } from './test-helpers';

describe('noise apply', () => {
	it('is deterministic for the same seed', () => {
		const source = makePixels(3, 3, () => [128, 128, 128, 255]);

		const a = apply(source, { amount: 50, seed: 5 });
		const b = apply(source, { amount: 50, seed: 5 });

		expect(Array.from(a.data)).toEqual(Array.from(b.data));
	});

	it('differs for a different seed', () => {
		const source = makePixels(3, 3, () => [128, 128, 128, 255]);

		const a = apply(source, { amount: 50, seed: 1 });
		const b = apply(source, { amount: 50, seed: 2 });

		expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
	});

	it('amount 0 is identity', () => {
		const source = makePixels(2, 2, (x, y) => [x * 10, y * 10, 5, 255]);
		const result = apply(source, { amount: 0, seed: 1 });

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});
});
