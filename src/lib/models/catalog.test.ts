import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CATALOG = readFileSync(join(import.meta.dirname, 'catalog.ts'), 'utf8');

/**
 * IL CATALOGO NOMINA MODELLI, NON TRASPORTI.
 *
 * `Luna`, `Grok`, `Gemini Flash` sono nomi di modelli, e restano: si chiedono al gateway con
 * quei nomi. `provider: 'kie' | 'gemini' | 'deepseek' | 'xiaomi'` era un'altra cosa — diceva CHI
 * serviva la chiamata — e quei quattro non servono più niente.
 *
 * Il campo non lo leggeva nessuno: dichiarato, riempito per quattro famiglie e mai interrogato.
 * Un campo che nessuno legge non documenta, fa credere al prossimo lettore che governi qualcosa.
 */
describe('il catalogo dei modelli', () => {
  it('non porta l’etichetta di un trasporto', () => {
    expect(CATALOG).not.toContain('ModelProvider');
    for (const dead of ["provider: 'kie'", "provider: 'gemini'", "provider: 'deepseek'"]) {
      expect(CATALOG, `resta ${dead}`).not.toContain(dead);
    }
  });
});
