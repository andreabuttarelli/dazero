import { describe, expect, it } from 'vitest';
import { parseAssetSourceFilter } from './asset-filter';

describe('il filtro della libreria è un terzo stato, non un booleano', () => {
  it('nessun parametro è "tutti", non un filtro mancante', () => {
    expect(parseAssetSourceFilter(null)).toBeUndefined();
  });

  it('"generated" scopa sui render', () => {
    expect(parseAssetSourceFilter('generated')).toBe('generated');
  });

  it('"upload" scopa sui caricati', () => {
    expect(parseAssetSourceFilter('upload')).toBe('upload');
  });

  it('un valore che non è dei tre non filtra nulla', () => {
    expect(parseAssetSourceFilter('imported')).toBeUndefined();
    expect(parseAssetSourceFilter('qualsiasi')).toBeUndefined();
  });
});
