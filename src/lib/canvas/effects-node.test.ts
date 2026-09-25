import { describe, expect, it } from 'vitest';
import { upstreamImageRef } from './effects-node';

const edges = [{ source: 'img', target: 'fx' }];

describe('upstreamImageRef', () => {
	it('reads the result of a generating node', () => {
		expect(upstreamImageRef('fx', edges, [{ id: 'img', data: { refId: 'a1' } }])).toBe('a1');
	});

	it('reads the asset of an uploaded image', () => {
		expect(upstreamImageRef('fx', edges, [{ id: 'img', data: { assetId: 'a2' } }])).toBe('a2');
	});

	it('is null when nothing with an image feeds the node', () => {
		expect(upstreamImageRef('fx', edges, [{ id: 'img', data: {} }])).toBeNull();
		expect(upstreamImageRef('fx', [], [{ id: 'img', data: { refId: 'a1' } }])).toBeNull();
	});
});
