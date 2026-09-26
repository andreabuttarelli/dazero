import { describe, expect, it } from 'vitest';
import { apply } from './dither';
import { makePixels, pixelAt } from './test-helpers';

describe('dither apply', () => {
	it('floyd-steinberg output channels are only 0 or 255', () => {
		const source = makePixels(4, 4, (x, y) => [x * 40 + y * 10, x * 40 + y * 10, x * 40 + y * 10, 255]);
		const result = apply(source, { mode: 'floyd-steinberg' });

		for (let i = 0; i < result.data.length; i += 4) {
			expect([0, 255]).toContain(result.data[i]);
			expect([0, 255]).toContain(result.data[i + 1]);
			expect([0, 255]).toContain(result.data[i + 2]);
		}
	});

	it('ordered (bayer) output channels are only 0 or 255', () => {
		const source = makePixels(4, 4, (x, y) => [x * 40 + y * 10, x * 40 + y * 10, x * 40 + y * 10, 255]);
		const result = apply(source, { mode: 'ordered' });

		for (let i = 0; i < result.data.length; i += 4) {
			expect([0, 255]).toContain(result.data[i]);
		}
	});

	it('preserves alpha', () => {
		const source = makePixels(1, 1, () => [128, 128, 128, 77]);
		const result = apply(source, { mode: 'ordered' });

		expect(pixelAt(result, 0, 0)[3]).toBe(77);
	});
});
