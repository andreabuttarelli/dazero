import { describe, expect, it } from 'vitest';
import { isRootPath } from './hooks.server';

/**
 * La homepage di marketing non esiste più: la radice manda in /app. Il riconoscimento della
 * radice è l'unica parte che può sbagliare in silenzio — se `/docs` passasse per radice, ogni
 * pagina pubblica finirebbe nell'app.
 */
describe('isRootPath', () => {
  it('la radice nuda, con o senza slash finale', () => {
    expect(isRootPath('/')).toBe(true);
    expect(isRootPath('')).toBe(true);
  });

  it('una pagina pubblica non è la radice', () => {
    for (const path of ['/docs', '/changelog', '/privacy', '/terms', '/cookies', '/app', '/login']) {
      expect(isRootPath(path), path).toBe(false);
    }
  });
});
