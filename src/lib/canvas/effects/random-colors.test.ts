import { describe, expect, it } from 'vitest';
import { apply } from './random-colors';
import { makePixels } from './test-helpers';

describe('random-colors apply', () => {
	it('is deterministic for the same seed', () => {
		const source = makePixels(3, 3, (x, y) => [x * 30, y * 30, 90, 255]);

		const a = apply(source, { seed: 42 });
		const b = apply(source, { seed: 42 });

		expect(Array.from(a.data)).toEqual(Array.from(b.data));
	});

	it('differs for a different seed', () => {
		const source = makePixels(3, 3, (x, y) => [x * 30, y * 30, 90, 255]);

		const a = apply(source, { seed: 1 });
		const b = apply(source, { seed: 2 });

		expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
	});

	it('keeps original alpha', () => {
		const source = makePixels(1, 1, () => [10, 20, 30, 100]);
		const result = apply(source, { seed: 7 });

		expect(result.data[3]).toBe(100);
	});
});
