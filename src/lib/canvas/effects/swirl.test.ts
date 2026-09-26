import { describe, expect, it } from 'vitest';
import { apply } from './swirl';
import { makePixels } from './test-helpers';

describe('swirl apply', () => {
	it('strength 0 is identity', () => {
		const source = makePixels(6, 6, (x, y) => [x * 10, y * 10, 5, 255]);
		const result = apply(source, { strength: 0, radius: 3 });

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});

	it('keeps dimensions unchanged', () => {
		const source = makePixels(6, 4, () => [1, 2, 3, 255]);
		const result = apply(source, { strength: 2, radius: 3 });

		expect(result.width).toBe(6);
		expect(result.height).toBe(4);
	});
});
