import { describe, expect, it } from 'vitest';
import { apply } from './halftone';
import { makePixels } from './test-helpers';

describe('halftone apply', () => {
	it('keeps dimensions unchanged', () => {
		const source = makePixels(8, 8, () => [128, 128, 128, 255]);
		const result = apply(source, { dotSize: 4 });

		expect(result.width).toBe(8);
		expect(result.height).toBe(8);
	});

	it('a fully white cell has no dark dot pixels', () => {
		const source = makePixels(4, 4, () => [255, 255, 255, 255]);
		const result = apply(source, { dotSize: 4 });

		for (let i = 0; i < result.data.length; i += 4) {
			expect(result.data[i]).toBeGreaterThan(200);
		}
	});

	it('a fully black cell produces some dark pixels', () => {
		const source = makePixels(4, 4, () => [0, 0, 0, 255]);
		const result = apply(source, { dotSize: 4 });

		let hasDark = false;
		for (let i = 0; i < result.data.length; i += 4) {
			if (result.data[i] < 50) {
				hasDark = true;
			}
		}
		expect(hasDark).toBe(true);
	});
});
