import { describe, it, expect } from 'vitest';
import en from '$lib/i18n/locales/en.json';
import { ERROR_COPY, errorCopyFor } from './error-copy';

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

describe('la pagina di errore non mostra mai una chiave grezza', () => {
  it('ogni tipo di errore ha titolo e testo nel dizionario', () => {
    for (const copy of Object.values(ERROR_COPY)) {
      expect(typeof lookup(copy.title), copy.title).toBe('string');
      expect(typeof lookup(copy.body), copy.body).toBe('string');
    }
  });

  it('lo stato HTTP sceglie il tipo', () => {
    expect(errorCopyFor(404)).toBe(ERROR_COPY.notFound);
    expect(errorCopyFor(401)).toBe(ERROR_COPY.denied);
    expect(errorCopyFor(403)).toBe(ERROR_COPY.denied);
    expect(errorCopyFor(500)).toBe(ERROR_COPY.generic);
  });
});
