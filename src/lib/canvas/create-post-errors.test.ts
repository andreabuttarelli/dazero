import { describe, expect, it } from 'vitest';
import { ERROR_COPY, errorCopyFor } from './create-post-errors';

describe('errorCopyFor', () => {
  it('ogni codice noto ha una copia non vuota', () => {
    for (const code of Object.keys(ERROR_COPY)) {
      expect(errorCopyFor(code).trim().length).toBeGreaterThan(0);
    }
  });

  it('un codice sconosciuto ha comunque una copia sensata', () => {
    const copy = errorCopyFor('qualcosa_di_mai_visto');
    expect(copy.trim().length).toBeGreaterThan(0);
  });
});
