import { describe, expect, it } from 'vitest';
import { apply } from './pixelate';
import { makePixels, pixelAt } from './test-helpers';

describe('pixelate apply', () => {
	it('collapses a 4x4 image into uniform 2x2 blocks at blockSize 2', () => {
		const source = makePixels(4, 4, (x, y) => [x * 60, y * 60, 0, 255]);

		const result = apply(source, { blockSize: 2 });

		for (const [bx, by] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) {
			const [r0, g0, b0, a0] = pixelAt(result, bx, by);
			for (let dy = 0; dy < 2; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					expect(pixelAt(result, bx + dx, by + dy)).toEqual([r0, g0, b0, a0]);
				}
			}
		}
	});

	it('keeps image dimensions unchanged', () => {
		const source = makePixels(5, 3, () => [10, 20, 30, 255]);
		const result = apply(source, { blockSize: 2 });

		expect(result.width).toBe(5);
		expect(result.height).toBe(3);
	});
});
