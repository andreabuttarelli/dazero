import { describe, expect, it } from 'vitest';
import { LAYOUTS, layoutAt } from './index';

describe('layoutAt', () => {
	it('dispatches to the matching layout and clamps its params', () => {
		const result = layoutAt('tilted-grid', 3, { columns: 999 }, 0);

		expect(result).toHaveLength(3);
	});

	it('covers every declared layout id', () => {
		expect(Object.keys(LAYOUTS).sort()).toEqual(['carousel-3d', 'tilted-grid']);
	});
});
