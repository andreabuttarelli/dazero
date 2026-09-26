import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from './node-data';
import { NODE_KIND_ICON, NODE_KIND_LABEL } from './node-label';

describe('NODE_KIND_ICON / NODE_KIND_LABEL — icona e nome per ogni nodes.type', () => {
  it('ha un\'icona per ogni tipo che nodes_type_check ammette, e nessuno di troppo', () => {
    expect(Object.keys(NODE_KIND_ICON).sort()).toEqual([...NODE_TYPES].sort());
  });

  it('ha un nome per ognuno, dallo stesso elenco', () => {
    expect(Object.keys(NODE_KIND_LABEL).sort()).toEqual([...NODE_TYPES].sort());
  });
});
