import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL, effectiveModel } from './default-models';

const choices = [{ id: 'first' }, { id: DEFAULT_MODEL.image }, { id: 'other' }];

describe('il modello di un nodo', () => {
  it('un nodo senza modello usa il default del suo medium, non il primo della lista', () => {
    expect(effectiveModel('image', null, choices)).toBe(DEFAULT_MODEL.image);
  });

  it('un modello scelto vince sempre sul default', () => {
    expect(effectiveModel('image', 'other', choices)).toBe('other');
  });

  it('se il default non è offerto, ripiega sul primo del catalogo', () => {
    expect(effectiveModel('image', null, [{ id: 'first' }])).toBe('first');
  });

  it('senza catalogo non inventa un modello', () => {
    expect(effectiveModel('video', null, [])).toBeNull();
  });

  it('ogni medium generativo ha un default', () => {
    expect(Object.keys(DEFAULT_MODEL).sort()).toEqual(['image', 'text', 'video']);
  });
});
