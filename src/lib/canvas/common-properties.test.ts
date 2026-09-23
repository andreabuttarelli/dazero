import { describe, expect, it } from 'vitest';
import { commonPropertiesOf } from './common-properties';

const node = (type: string, data: Record<string, unknown>) => ({ type, data });

describe('cosa hanno in comune più nodi selezionati', () => {
  it('stesso modello su tutti: "same"', () => {
    const out = commonPropertiesOf([
      node('image', { model: 'x' }),
      node('image', { model: 'x' })
    ]);

    expect(out.type).toBe('image');
    expect(out.model).toEqual({ kind: 'same', value: 'x' });
  });

  it('modelli diversi: "mixed", non un valore inventato', () => {
    const out = commonPropertiesOf([
      node('image', { model: 'x' }),
      node('image', { model: 'y' })
    ]);

    expect(out.model).toEqual({ kind: 'mixed' });
  });

  it('tipi diversi non condividono niente: il pannello resta vuoto', () => {
    const out = commonPropertiesOf([node('text', {}), node('image', { model: 'x' })]);

    expect(out.type).toBeNull();
    expect(out.model).toEqual({ kind: 'absent' });
  });

  it('il testo non ha aspect ratio: resta "absent" anche se tutti coincidono su altro', () => {
    const out = commonPropertiesOf([node('text', { model: null }), node('text', { model: null })]);

    expect(out.aspectRatio).toEqual({ kind: 'absent' });
  });

  it('aspect ratio comune su più immagini', () => {
    const out = commonPropertiesOf([
      node('image', { model: 'x', params: { aspectRatio: '1:1' } }),
      node('image', { model: 'x', params: { aspectRatio: '1:1' } })
    ]);

    expect(out.aspectRatio).toEqual({ kind: 'same', value: '1:1' });
  });

  it('una selezione vuota non condivide niente', () => {
    const out = commonPropertiesOf([]);

    expect(out.type).toBeNull();
  });

  it('un solo nodo: il suo valore È il comune', () => {
    const out = commonPropertiesOf([node('video', { model: 'z' })]);

    expect(out.model).toEqual({ kind: 'same', value: 'z' });
  });
});
