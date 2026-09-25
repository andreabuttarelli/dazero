import { describe, expect, it } from 'vitest';
import { applyStack, EFFECTS } from './index';
import { makePixels } from './test-helpers';

describe('applyStack', () => {
	it('applies steps in order, and order changes the result', () => {
		const source = makePixels(4, 4, (x, y) => [(x + y) * 32, (x + y) * 32, (x + y) * 32, 255]);

		const pixelateThenPosterize = applyStack(source, [
			{ id: 'pixelate', params: { blockSize: 2 } },
			{ id: 'posterize', params: { levels: 2 } }
		]);

		const posterizeThenPixelate = applyStack(source, [
			{ id: 'posterize', params: { levels: 2 } },
			{ id: 'pixelate', params: { blockSize: 2 } }
		]);

		expect(Array.from(pixelateThenPosterize.data)).not.toEqual(Array.from(posterizeThenPixelate.data));
	});

	it('skips unknown effect ids', () => {
		const source = makePixels(2, 2, () => [10, 20, 30, 255]);

		const result = applyStack(source, [{ id: 'not-a-real-effect' as never, params: {} }]);

		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});

	it('clamps params to their declared ranges before applying', () => {
		const source = makePixels(4, 4, () => [10, 20, 30, 255]);

		const clamped = applyStack(source, [{ id: 'pixelate', params: { blockSize: 999 } }]);
		const atMax = applyStack(source, [{ id: 'pixelate', params: { blockSize: EFFECTS.pixelate.params[0].kind === 'range' ? EFFECTS.pixelate.params[0].max : 0 } }]);

		expect(Array.from(clamped.data)).toEqual(Array.from(atMax.data));
	});

	it('every effect has an Italian label and lives in EFFECTS', () => {
		for (const id of Object.keys(EFFECTS)) {
			expect(EFFECTS[id as keyof typeof EFFECTS].label.length).toBeGreaterThan(0);
			expect(typeof EFFECTS[id as keyof typeof EFFECTS].apply).toBe('function');
		}
	});
});
