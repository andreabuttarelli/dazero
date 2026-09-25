import { describe, expect, it } from 'vitest';
import { apply } from './ascii';
import { makePixels } from './test-helpers';

describe('ascii apply', () => {
	it('keeps output the same size as the source', () => {
		const source = makePixels(10, 10, () => [128, 128, 128, 255]);
		const result = apply(source, { cellSize: 5, charset: 'default', mode: 'mono' });

		expect(result.width).toBe(10);
		expect(result.height).toBe(10);
	});

	it('mono mode output uses only two colours', () => {
		const source = makePixels(10, 10, (x) => (x < 5 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
		const result = apply(source, { cellSize: 5, charset: 'default', mode: 'mono' });

		const colours = new Set<string>();
		for (let i = 0; i < result.data.length; i += 4) {
			colours.add(`${result.data[i]},${result.data[i + 1]},${result.data[i + 2]}`);
		}

		expect(colours.size).toBeLessThanOrEqual(2);
	});
});
