import { describe, expect, it } from 'vitest';
import { upstreamImageRef, upstreamMedia } from './effects-node';

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

describe('upstreamMedia', () => {
	it('keeps the medium of a video source', () => {
		expect(upstreamMedia('fx', edges, [{ id: 'img', type: 'video', data: { refId: 'v1' } }])).toEqual({ refId: 'v1', kind: 'video' });
	});

	it('defaults legacy uploaded media to image', () => {
		expect(upstreamMedia('fx', edges, [{ id: 'img', type: 'media', data: { assetId: 'a1' } }])).toEqual({ refId: 'a1', kind: 'image' });
	});
});
