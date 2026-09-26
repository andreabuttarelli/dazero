import { describe, expect, it } from 'vitest';
import { apply } from './hue-saturation';
import { makePixels, pixelAt } from './test-helpers';

describe('hue-saturation apply', () => {
	it('is identity at hue 0 and saturation 1', () => {
		const source = makePixels(2, 2, (x, y) => [x * 100, y * 50, 30, 255]);
		const result = apply(source, { hue: 0, saturation: 1 });

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});

	it('desaturating to 0 makes channels equal (grayscale)', () => {
		const source = makePixels(1, 1, () => [200, 50, 10, 255]);
		const result = apply(source, { hue: 0, saturation: 0 });
		const [r, g, b] = pixelAt(result, 0, 0);

		expect(r).toBe(g);
		expect(g).toBe(b);
	});
});
