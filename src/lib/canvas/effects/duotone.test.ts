import { describe, expect, it } from 'vitest';
import { apply } from './duotone';
import { makePixels, pixelAt } from './test-helpers';

describe('duotone apply', () => {
	it('maps black to the shadow colour and white to the highlight colour', () => {
		const source = makePixels(2, 1, (x) => [x * 255, x * 255, x * 255, 255]);
		const result = apply(source, { shadow: '#000080', highlight: '#ffff00' });

		expect(pixelAt(result, 0, 0)).toEqual([0, 0, 128, 255]);
		expect(pixelAt(result, 1, 0)).toEqual([255, 255, 0, 255]);
	});
});
