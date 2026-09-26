import { describe, expect, it } from 'vitest';
import { apply } from './wave';
import { makePixels } from './test-helpers';

describe('wave apply', () => {
	it('amplitude 0 is identity', () => {
		const source = makePixels(4, 4, (x, y) => [x * 10, y * 10, 5, 255]);
		const result = apply(source, { amplitude: 0, frequency: 1, direction: 'horizontal' });

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});

	it('keeps dimensions unchanged', () => {
		const source = makePixels(5, 3, () => [1, 2, 3, 255]);
		const result = apply(source, { amplitude: 3, frequency: 1, direction: 'vertical' });

		expect(result.width).toBe(5);
		expect(result.height).toBe(3);
	});
});
