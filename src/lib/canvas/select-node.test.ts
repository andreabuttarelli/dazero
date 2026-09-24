import { describe, expect, it } from 'vitest';
import { clampIndex, listFeedingSelect, newSelectNodeAt, selectNodeSize } from './select-node';

describe('un select nasce con indice 1', () => {
  it('centrato sul punto, mai a indice 0', () => {
    const { w, h } = selectNodeSize();
    const tile = newSelectNodeAt({ x: 40, y: 40 });

    expect(tile).toMatchObject({ x: 40 - w / 2, y: 40 - h / 2, index: 1, connectable: true });
  });
});

describe('clampare un indice 1-based', () => {
  it('mai sotto 1', () => {
    expect(clampIndex(0, 10)).toBe(1);
    expect(clampIndex(-5, 10)).toBe(1);
  });

  it('mai oltre la lunghezza nota', () => {
    expect(clampIndex(99, 3)).toBe(3);
  });

  it('lunghezza ignota (0): solo il minimo si applica', () => {
    expect(clampIndex(7, 0)).toBe(7);
  });

  it('arrotonda un indice non intero', () => {
    expect(clampIndex(2.6, 10)).toBe(3);
  });
});

describe('la lista che alimenta un select', () => {
  const nodesById = new Map([
    ['n-list', { id: 'n-list', type: 'list' }],
    ['n-text', { id: 'n-text', type: 'text' }]
  ]);

  it('il primo arco entrante la cui sorgente è una list', () => {
    const edges = [
      { sourceNodeId: 'n-text', targetNodeId: 'n-select' },
      { sourceNodeId: 'n-list', targetNodeId: 'n-select' }
    ];
    expect(listFeedingSelect('n-select', edges, nodesById)).toEqual({ id: 'n-list', type: 'list' });
  });

  it('nessun arco da una list: null, non un errore', () => {
    const edges = [{ sourceNodeId: 'n-text', targetNodeId: 'n-select' }];
    expect(listFeedingSelect('n-select', edges, nodesById)).toBeNull();
  });

  it('nessun arco affatto: null', () => {
    expect(listFeedingSelect('n-select', [], nodesById)).toBeNull();
  });
});
