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
 * Le superfici che li mostrano sono due — la barra in basso e il menù del doppio clic — e
 * finché le icone stavano dentro la barra, l'altra doveva riscriverle. Due elenchi scritti a
 * mano divergono al primo cambio, in silenzio e solo su una delle superfici: si vede un globo in
 * fondo allo schermo e un altro nome nel menù, per la stessa cosa.
 *
 * LA TARGHETTA SOPRA IL NODO non legge più da qui: legge da `node-label.ts`, che copre i dodici
 * `nodes.type` e non solo i sette aggiungibili — la copre `node-label.test.ts`.
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

  it('la targhetta di ogni nodo viene dal registro di CanvasTile, non da una copia locale', () => {
    const tile = read('CanvasTile.svelte');

    expect(tile).toMatch(/NODE_KIND_ICON/);
    expect(tile).toMatch(/NODE_KIND_LABEL/);

    for (const name of ['GenNode.svelte', 'IframeNode.svelte', 'DocNode.svelte', 'ProductsNode.svelte', 'SocialFeedNode.svelte', 'InfluencerNode.svelte', 'UploadedNode.svelte']) {
      expect(read(name)).not.toMatch(/-tag/);
    }
  });
});

describe('le icone che un componente importa', () => {
  const require = createRequire(import.meta.url);

  it('esistono davvero in lucide, una per una', () => {
    const missing: string[] = [];

    for (const name of ['CanvasAddBar.svelte', 'IframeNode.svelte', 'DocNode.svelte']) {
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
