import { describe, expect, it } from 'vitest';
import { LAYOUTS, instanceCountFor, layoutAt, mediaIndexFor } from './index';

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
			'explorer-grid',
			'helix',
			'media-cloud',
			'media-ring',
			'staggered-grid',
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
		expect(instanceCountFor('explorer-grid', 3, { columns: 3, rows: 3 })).toBe(25);
	});

	it('does not create instances without media', () => {
		expect(instanceCountFor('media-cloud', 0, { density: 24 })).toBe(0);
	});
});

describe('mediaIndexFor', () => {
	it('cycles media without equal neighbours in grid layouts', () => {
		const params = { columns: 3, rows: 3 };

		expect(mediaIndexes('tilted-grid', 9, params)).toEqual([0, 1, 2, 1, 2, 0, 2, 0, 1]);
		expect(mediaIndexes('staggered-grid', 9, params)).toEqual([0, 1, 2, 1, 2, 0, 2, 0, 1]);
	});

	it('cycles media independently around every ring', () => {
		const params = { rings: 2, itemsPerRing: 3 };

		expect(mediaIndexes('media-ring', 6, params)).toEqual([0, 1, 1, 2, 2, 0]);
	});

	it('keeps the requested media cycle in every flowing layout', () => {
		const ids = ['carousel-3d', 'media-cloud', 'helix', 'vertical-flow', 'coverflow'] as const;

		for (const id of ids) {
			expect(mediaIndexes(id, 6, {})).toEqual([0, 1, 2, 0, 1, 2]);
		}
	});
});

function mediaIndexes(
	layout: Parameters<typeof mediaIndexFor>[0],
	count: number,
	params: Parameters<typeof mediaIndexFor>[3]
): number[] {
	return Array.from({ length: count }, (_, index) => mediaIndexFor(layout, index, count, params, 3));
}
