import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * IL MODELLO ERA SCRITTO E NON LO CHIAMAVA NESSUNO.
 *
 * `graph.ts` rispondeva «questo arco non produrrebbe niente» con ventiquattro test verdi, mentre
 * la tela lasciava tirare qualunque linea e la salvava. Il difetto non era nel modello: era il
 * filo staccato fra lui e il gesto, e un filo staccato non lo vede nessun test di unità — ognuno
 * dei due pezzi passa da solo.
 *
 * Si legge il SORGENTE perché il difetto è di collegamento: montare il componente direbbe che non
 * è esploso, non che la libreria sta chiedendo il permesso prima di disegnare una linea.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const flow = readFileSync(
  join(dir, '..', 'components', 'canvas', 'CanvasFlow.svelte'),
  'utf8'
);

describe('la tela chiede il permesso prima di far nascere un arco', () => {
  it('passa `isValidConnection` alla libreria, che è il punto in cui si può ancora dire di no', () => {
    expect(flow).toMatch(/\{isValidConnection\}|isValidConnection=\{/);
  });

  it('il permesso viene dal modello, non da una regola riscritta nel componente', () => {
    expect(flow).toMatch(/from '\$lib\/canvas\/connect-rules'/);
    expect(flow).toMatch(/verdictBetween\(/);
  });

  /**
   * Un rifiuto muto è peggio di nessun rifiuto: la linea si tira, sparisce, e chi l'ha tirata
   * riprova identico. `canConnect` il motivo ce l'ha già — buttarlo via è l'unico vero errore.
   */
  it('il motivo del rifiuto arriva allo schermo', () => {
    expect(flow).toMatch(/refus/i);
  });

  it('un arco si può togliere e gli si può cambiare verso', () => {
    expect(flow).toMatch(/onEdgeDelete/);
    expect(flow).toMatch(/onEdgeRetype/);
  });
});
