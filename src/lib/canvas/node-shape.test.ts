import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * UN NODO CHE GALLEGGIA SULLA TELA, non un riquadro appoggiato sopra.
 *
 * Il difetto era che i due nodi erano due rettangoli con lo stesso bordo dello sfondo, e su una
 * tela — dove tutto è su un piano solo e il contorno è l'unica cosa che separa una cosa
 * dall'altra — un bordo da 1px non basta a dire dove finisce un nodo e comincia la tela. L'ombra
 * lo fa, e costa zero: è il lavoro che la tela già fa da sé sui riquadri della libreria.
 *
 * E IL RISULTATO DEVE RIEMPIRE. Un'immagine dentro un `padding` di dieci pixel è una miniatura
 * con una cornice; il nodo esiste per guardarla, quindi arriva ai bordi e il bordo stesso la
 * ritaglia col suo raggio.
 *
 * Si legge il SORGENTE perché il difetto è di aspetto: montare il componente direbbe che non è
 * esploso, non che un'immagine sta dentro una cornice che nessuno ha chiesto.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', 'components', 'canvas');
const gen = readFileSync(join(root, 'GenNode.svelte'), 'utf8');
const frame = readFileSync(join(root, 'IframeNode.svelte'), 'utf8');

/** Le regole del guscio di un nodo: il blocco `.gen {…}` o `.frame {…}`, non tutto il foglio. */
function shellOf(source: string, klass: string): string {
  return new RegExp(`\\n  \\.${klass} \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
}

const NODES = [
  { name: 'il nodo che produce', source: gen, shell: 'gen' },
  { name: 'la pagina incorporata', source: frame, shell: 'frame' }
] as const;

describe('i due nodi galleggiano, e nello stesso modo', () => {
  for (const { name, source, shell } of NODES) {
    it(`${name} ha un'ombra che lo stacca dalla tela`, () => {
      expect(shellOf(source, shell)).toMatch(/box-shadow:/);
    });

    /**
     * Il GUSCIO prende i colori dai token, sempre: un esadecimale lì è un nodo bianco su una tela
     * scura, e il tema scuro cambia i token da solo. Dentro c'è un'eccezione vera e dichiarata —
     * il fondo bianco sotto un iframe, che è il colore della pagina ospite e non del nostro
     * prodotto — quindi la regola si controlla dove vale, non ovunque.
     */
    it(`${name} veste il proprio guscio coi token dell'app`, () => {
      expect(shellOf(source, shell)).toMatch(/var\(--paper/);
      expect(shellOf(source, shell)).not.toMatch(/background:\s*#/);
    });
  }

  it('il risultato di un nodo arriva ai bordi invece di stare in una cornice', () => {
    const body = /\.gen-body \{([^}]*)\}/.exec(gen)?.[1] ?? '';

    expect(body).not.toMatch(/padding:\s*\d/);
  });

  /**
   * Il bordo del nodo ritaglia il contenuto, ma il nodo intero NON può tagliare: la fascia delle
   * proprietà gli sporge sopra di proposito, e un `overflow: hidden` sul contenitore la
   * mangerebbe. È il difetto per cui il taglio sta sulle fasce interne, una per una.
   */
  it('il nodo non taglia se stesso: la fascia delle proprietà gli sporge sopra', () => {
    expect(shellOf(gen, 'gen')).toMatch(/position:\s*relative/);
    expect(shellOf(gen, 'gen')).not.toMatch(/overflow:\s*hidden/);
  });
});
