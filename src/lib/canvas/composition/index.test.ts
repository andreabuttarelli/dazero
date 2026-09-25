import { describe, expect, it } from 'vitest';
import { LAYOUTS, instanceCountFor, layoutAt } from './index';

describe('layoutAt', () => {
	it('keeps carousel layouts on a fixed camera', () => {
		expect(LAYOUTS.coverflow.camera).toBe('fixed');
		expect(LAYOUTS['vertical-flow'].camera).toBe('fixed');
		expect(LAYOUTS['carousel-3d'].camera).toBe('fixed');
		expect(LAYOUTS['carousel-3d'].motion).toBe('cycle');
	});

	it('dispatches to the matching layout and clamps its params', () => {
		const result = layoutAt('tilted-grid', 3, { columns: 999 }, 0);

		expect(result).toHaveLength(3);
	});

	it('covers every declared layout id', () => {
		expect(Object.keys(LAYOUTS).sort()).toEqual([
			'carousel-3d',
			'coverflow',
			'helix',
			'media-cloud',
			'media-ring',
			'tilted-grid',
			'vertical-flow'
		]);
	});
});

describe('instanceCountFor', () => {
	it('repeats sparse input until the selected layout is filled', () => {
		expect(instanceCountFor('tilted-grid', 3, { columns: 5, rows: 4 })).toBe(20);
		expect(instanceCountFor('carousel-3d', 3, { slots: 14 })).toBe(14);
		expect(instanceCountFor('media-cloud', 3, { density: 24 })).toBe(24);
		expect(instanceCountFor('media-ring', 3, { rings: 3, itemsPerRing: 10 })).toBe(30);
		expect(instanceCountFor('helix', 3, { items: 18 })).toBe(18);
		expect(instanceCountFor('vertical-flow', 3, { items: 11 })).toBe(11);
		expect(instanceCountFor('coverflow', 3, { items: 9 })).toBe(9);
	});

	it('does not create instances without media', () => {
		expect(instanceCountFor('media-cloud', 0, { density: 24 })).toBe(0);
	});
});
