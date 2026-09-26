import { describe, expect, it } from 'vitest';
import { upstreamImageRefs } from './composition-node';

describe('upstreamImageRefs', () => {
  it('collects refIds from several image nodes wired in', () => {
    const edges = [
      { source: 'img1', target: 'comp' },
      { source: 'img2', target: 'comp' }
    ];
    const nodes = [
      { id: 'img1', data: { refId: 'a1' } },
      { id: 'img2', data: { assetId: 'a2' } }
    ];
    expect(upstreamImageRefs('comp', edges, nodes)).toEqual(['a1', 'a2']);
  });

  it('expands a connected list node into its image items', () => {
    const edges = [{ source: 'list1', target: 'comp' }];
    const nodes = [
      {
        id: 'list1',
        data: { items: [{ asset_id: 'a1' }, { asset_id: 'a2' }, { text: 'no image here' }] }
      }
    ];
    expect(upstreamImageRefs('comp', edges, nodes)).toEqual(['a1', 'a2']);
  });

  it('is empty when nothing feeds the node', () => {
    expect(upstreamImageRefs('comp', [], [{ id: 'img1', data: { refId: 'a1' } }])).toEqual([]);
    expect(upstreamImageRefs('comp', [{ source: 'img1', target: 'comp' }], [{ id: 'img1', data: {} }])).toEqual([]);
  });
});
