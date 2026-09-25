import { describe, expect, it } from 'vitest';
import { apply } from './rgb-shift';
import { makePixels, pixelAt } from './test-helpers';

describe('rgb-shift apply', () => {
	it('moves the red channel by the given x offset', () => {
		const source = makePixels(5, 1, (x) => (x === 1 ? [255, 0, 0, 255] : [0, 0, 0, 255]));

		const result = apply(source, { rx: 2, ry: 0, gx: 0, gy: 0, bx: 0, by: 0 });

		expect(pixelAt(result, 3, 0)[0]).toBe(255);
		expect(pixelAt(result, 1, 0)[0]).toBe(0);
	});

	it('all offsets 0 is identity', () => {
		const source = makePixels(3, 3, (x, y) => [x * 20, y * 20, 40, 255]);
		const result = apply(source, { rx: 0, ry: 0, gx: 0, gy: 0, bx: 0, by: 0 });

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});
});
