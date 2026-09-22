import { describe, expect, it } from 'vitest';
import { pathFor, statusForFailure } from './index';
import { UPDATE_PRODUCT } from './studio';

describe('il contratto del prodotto', () => {
  it('modifica un prodotto con un campo solo, senza doverli ripetere tutti', () => {
    expect(UPDATE_PRODUCT.input.safeParse({ id: 'p1', pricing: '19,90 €' }).success).toBe(true);
    expect(UPDATE_PRODUCT.input.safeParse({ pricing: '19,90 €' }).success).toBe(false);
  });

  it('non lascia scrivere il brand di appartenenza della riga', () => {
    expect(
      UPDATE_PRODUCT.input.safeParse({ id: 'p1', title: 'x', brand_id: 'brand-2' }).success
    ).toBe(false);
  });

  it('dichiara il 404 e non lo lascia diventare un 500', () => {
    expect(statusForFailure(UPDATE_PRODUCT, 'not_found')).toBe(404);
  });

  it('non è distruttivo', () => {
    expect(UPDATE_PRODUCT.destructive).toBe(false);
  });

  it('indirizza la rotta che esiste già', () => {
    expect(pathFor(UPDATE_PRODUCT, 'demo', 'p1')).toBe('/api/v1/brands/demo/products/p1');
  });
});
