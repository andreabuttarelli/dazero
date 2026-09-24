import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from './node-data';
import { nodeSize } from './node-size';

describe('ogni tipo di nodo ha una misura: la tela non si rompe su un tipo nuovo', () => {
  it.each(NODE_TYPES)('%s ha larghezza e altezza', (type) => {
    const { w, h } = nodeSize(type);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it('un tipo che il modello non conosce riceve la misura di ripiego, non undefined', () => {
    const { w, h } = nodeSize('document');
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });
});
