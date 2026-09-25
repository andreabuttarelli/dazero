import { describe, expect, it } from 'vitest';
import { applyStack } from './index';
import { addStep, controlFor, inputChanged, moveStep, removeStep, setParam, toggleStep } from './editor';
import { makePixels } from './test-helpers';
import type { EffectStep } from './types';

const pixelate: EffectStep = { id: 'pixelate', params: { blockSize: 8 }, enabled: true };
const posterize: EffectStep = { id: 'posterize', params: { levels: 4 }, enabled: true };
const noise: EffectStep = { id: 'noise', params: { amount: 40, seed: 1 }, enabled: true };

describe('controlFor', () => {
	it('renders a range as a slider with its bounds and the current value', () => {
		const control = controlFor({ name: 'b', label: 'B', kind: 'range', min: 1, max: 64, step: 1, default: 8 }, 12);
		expect(control).toEqual({ kind: 'slider', min: 1, max: 64, step: 1, value: 12 });
	});

	it('falls back to the default when the value has the wrong type', () => {
		const control = controlFor({ name: 'b', label: 'B', kind: 'range', min: 1, max: 64, step: 1, default: 8 }, 'x');
		expect(control).toEqual({ kind: 'slider', min: 1, max: 64, step: 1, value: 8 });
	});

	it('renders a select with its options, rejecting an unknown value', () => {
		const param = {
			name: 'm', label: 'M', kind: 'select' as const,
			options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a'
		};
		expect(controlFor(param, 'b')).toEqual({ kind: 'select', options: param.options, value: 'b' });
		expect(controlFor(param, 'z')).toEqual({ kind: 'select', options: param.options, value: 'a' });
	});

	it('renders a color as a color picker', () => {
		expect(controlFor({ name: 'c', label: 'C', kind: 'color', default: '#000000' }, '#ff0000')).toEqual({
			kind: 'color', value: '#ff0000'
		});
	});

	it('renders a seed as a number with a reroll', () => {
		expect(controlFor({ name: 's', label: 'S', kind: 'seed', default: 1 }, 42)).toEqual({ kind: 'seed', value: 42 });
	});
});

describe('stack editing', () => {
	it('adds a step with the defaults of its effect, enabled', () => {
		expect(addStep([pixelate], 'duotone')).toEqual([
			pixelate,
			{ id: 'duotone', params: { shadow: '#000000', highlight: '#ffffff' }, enabled: true }
		]);
	});

	it('moves a step up and down by one', () => {
		expect(moveStep([pixelate, posterize, noise], 1, 'up')).toEqual([posterize, pixelate, noise]);
		expect(moveStep([pixelate, posterize, noise], 1, 'down')).toEqual([pixelate, noise, posterize]);
	});

	it('does nothing when moving past either end', () => {
		expect(moveStep([pixelate, posterize], 0, 'up')).toEqual([pixelate, posterize]);
		expect(moveStep([pixelate, posterize], 1, 'down')).toEqual([pixelate, posterize]);
	});

	it('toggles a step', () => {
		expect(toggleStep([pixelate], 0)).toEqual([{ ...pixelate, enabled: false }]);
		expect(toggleStep(toggleStep([pixelate], 0), 0)).toEqual([pixelate]);
	});

	it('removes a step', () => {
		expect(removeStep([pixelate, posterize], 0)).toEqual([posterize]);
	});

	it('sets one param without touching the others', () => {
		expect(setParam([noise], 0, 'amount', 90)).toEqual([{ ...noise, params: { amount: 90, seed: 1 } }]);
	});
});

describe('applyStack with disabled steps', () => {
	it('skips a disabled step', () => {
		const source = makePixels(4, 4, (x, y) => [(x + y) * 32, 0, 0, 255]);
		const result = applyStack(source, [{ ...pixelate, params: { blockSize: 4 }, enabled: false }]);
		expect(Array.from(result.data)).toEqual(Array.from(source.data));
	});
});

describe('inputChanged', () => {
	it('is false before any apply', () => {
		expect(inputChanged(null, 'a1')).toBe(false);
	});

	it('is false while the applied input is still upstream', () => {
		expect(inputChanged('a1', 'a1')).toBe(false);
	});

	it('is true when upstream now carries another asset', () => {
		expect(inputChanged('a1', 'a2')).toBe(true);
	});

	it('is false when nothing is connected anymore', () => {
		expect(inputChanged('a1', null)).toBe(false);
	});
});
