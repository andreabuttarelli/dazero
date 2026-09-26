import { describe, expect, it } from 'vitest';
import { apply } from './posterize';
import { makePixels, pixelAt } from './test-helpers';

describe('posterize apply', () => {
	it('maps every channel to 0 or 255 when levels is 2', () => {
		const source = makePixels(3, 1, (x) => [x * 127, 255 - x * 127, 128, 255]);

		const result = apply(source, { levels: 2 });

		for (let x = 0; x < 3; x++) {
			const [r, g, b] = pixelAt(result, x, 0);
			expect([0, 255]).toContain(r);
			expect([0, 255]).toContain(g);
			expect([0, 255]).toContain(b);
		}
	});

	it('leaves alpha untouched', () => {
		const source = makePixels(1, 1, () => [10, 20, 30, 128]);
		const result = apply(source, { levels: 4 });

		expect(pixelAt(result, 0, 0)[3]).toBe(128);
	});
});
