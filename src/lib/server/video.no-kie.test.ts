import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname);

/**
 * KIE NON ESISTE PIÙ, E IL SORGENTE LO DEVE DIMOSTRARE.
 *
 * Un ramo verso un fornitore spento non fallisce in modo rumoroso: aspetta. Resta lì finché una
 * variabile d'ambiente, un modello fuori catalogo o un id senza prefisso ce lo manda, e allora
 * il render parte verso un'API che non risponde più — o peggio, che risponde e fattura.
 *
 * Questo test guarda il TESTO perché è l'unica cosa che vede un ramo che nessun altro test
 * percorre: la suite può essere verde su codice che non esegue mai.
 */
const VIETATI = ['kie', 'Kie', 'KIE', 'aleph', 'Aleph'];

describe('il video non nomina kie da nessuna parte', () => {
  for (const file of ['video.ts', 'openrouter-video.ts']) {
    it(`${file} non contiene nessuna traccia del vecchio fornitore`, () => {
      const src = readFileSync(join(SRC, file), 'utf8');
      const trovati = VIETATI.filter((t) => src.includes(t));

      expect(trovati, `${file} nomina ancora: ${trovati.join(', ')}`).toEqual([]);
    });
  }

  it('non resta un endpoint da scegliere: il trasporto è uno solo', () => {
    const src = readFileSync(join(SRC, 'video.ts'), 'utf8');

    expect(src).not.toContain('videoEndpoint');
    expect(src).not.toContain('videoTaskProvider');
  });
});
