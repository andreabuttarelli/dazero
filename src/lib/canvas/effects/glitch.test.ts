import { describe, expect, it } from 'vitest';
import { apply } from './glitch';
import { makePixels } from './test-helpers';

describe('glitch apply', () => {
	it('is deterministic for the same seed', () => {
		const source = makePixels(6, 6, (x, y) => [x * 40, y * 40, 0, 255]);

		const a = apply(source, { seed: 3, amount: 5, sliceHeight: 2 });
		const b = apply(source, { seed: 3, amount: 5, sliceHeight: 2 });

		expect(Array.from(a.data)).toEqual(Array.from(b.data));
	});

	it('differs for a different seed', () => {
		const source = makePixels(6, 6, (x, y) => [x * 40, y * 40, 0, 255]);

		const a = apply(source, { seed: 1, amount: 5, sliceHeight: 2 });
		const b = apply(source, { seed: 2, amount: 5, sliceHeight: 2 });

		expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
	});

	it('amount 0 is identity', () => {
		const source = makePixels(4, 4, (x, y) => [x * 10, y * 10, 5, 255]);
		const result = apply(source, { seed: 1, amount: 0, sliceHeight: 2 });

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});
});
