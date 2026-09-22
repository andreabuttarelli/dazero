import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CANVAS_ADDABLE, ADDABLE_LABEL } from './addable';
import { ADDABLE_ICON } from './addable-icons';

/**
 * UN NOME E UN'ICONA PER TIPO, IN UN POSTO SOLO.
 *
 * Le superfici che li mostrano sono tre — la barra in basso, il menù del doppio clic e la
 * targhetta sul nodo — e finché le icone stavano dentro la barra, le altre due dovevano
 * riscriverle. Due elenchi scritti a mano divergono al primo cambio, in silenzio e solo su una
 * delle superfici: si vede un globo in fondo allo schermo e un quadrato sul nodo, per la stessa
 * cosa.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const read = (name: string) =>
  readFileSync(join(dir, '..', 'components', 'canvas', name), 'utf8');

describe('il registro di nomi e icone', () => {
  it("ha un'icona per ogni cosa che si può aggiungere, e nessuna di troppo", () => {
    expect(Object.keys(ADDABLE_ICON).sort()).toEqual([...CANVAS_ADDABLE].sort());
  });

  it('ha un nome per ognuna, dallo stesso elenco', () => {
    expect(Object.keys(ADDABLE_LABEL).sort()).toEqual([...CANVAS_ADDABLE].sort());
  });
});

describe('le superfici che li mostrano', () => {
  it('la barra prende le icone dal registro invece di importarle una per una', () => {
    const bar = read('CanvasAddBar.svelte');

    expect(bar).toMatch(/ADDABLE_ICON/);
    // `keyboard` resta un import suo: apre la scheda delle scorciatoie, non aggiunge niente alla
    // tela, quindi non è una voce del registro.
    expect(bar).not.toMatch(/icons\/(type|image|video|globe|file-text)'/);
  });

  it('il nodo che produce porta la sua targhetta dallo stesso registro', () => {
    const gen = read('GenNode.svelte');

    expect(gen).toMatch(/ADDABLE_ICON/);
    expect(gen).toMatch(/ADDABLE_LABEL/);
  });

  it('e anche la pagina incorporata, che è un tipo come gli altri', () => {
    const frame = read('IframeNode.svelte');

    expect(frame).toMatch(/ADDABLE_ICON/);
    expect(frame).toMatch(/ADDABLE_LABEL/);
  });

  it('e il documento, che ha la sua targhetta come gli altri', () => {
    const doc = read('DocNode.svelte');

    expect(doc).toMatch(/ADDABLE_ICON/);
    expect(doc).toMatch(/ADDABLE_LABEL/);
  });
});

describe('le icone che un componente importa', () => {
  const require = createRequire(import.meta.url);

  it('esistono davvero in lucide, una per una', () => {
    const missing: string[] = [];

    for (const name of ['CanvasAddBar.svelte', 'GenNode.svelte', 'IframeNode.svelte', 'DocNode.svelte']) {
      for (const match of read(name).matchAll(/@lucide\/svelte\/icons\/([a-z0-9-]+)/g)) {
        try {
          require.resolve(`@lucide/svelte/icons/${match[1]}`);
        } catch {
          missing.push(`${name}: ${match[1]}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
