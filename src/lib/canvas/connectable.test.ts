import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * NON TUTTO QUEL CHE STA SULLA TELA SI COLLEGA.
 *
 * Gli attacchi dicono «da qui parte un arco». Su un post o un documento è vero; sul recap del
 * workbench no — quello è un pannello che riassume il brand, non un contenuto che ne produce un
 * altro, e `canConnect` non saprebbe nemmeno che ruolo dargli. Due puntini su una cosa che non si
 * collega sono un invito a un gesto che poi fallisce.
 *
 * Il difetto è VISIVO — puntini di troppo, un arco tirato nel vuoto — quindi si legge il sorgente:
 * montare il componente direbbe che non è esploso, non che la tile giusta ha i suoi attacchi.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', 'components', 'canvas');
const flow = readFileSync(join(root, 'CanvasFlow.svelte'), 'utf8');
const tileComponent = readFileSync(join(root, 'CanvasTile.svelte'), 'utf8');
const workbench = readFileSync(
  join(dir, '..', '..', 'routes', 'p', '[projectId]', 'workbench', '+page.svelte'),
  'utf8'
);

describe('gli attacchi di una tile', () => {
  it('la tile li disegna solo quando le viene detto', () => {
    // Senza la condizione i Handle sono su OGNI nodo, e la proprietà non serve a niente.
    expect(tileComponent).toMatch(/\{#if [^}]*connectable[^}]*\}/);
  });

  it('la tela porta la scelta dal chiamante dentro il nodo', () => {
    expect(flow).toMatch(/connectable/);
  });

  it('il recap del workbench non si collega: è un pannello, non un contenuto', () => {
    const recap = /const RECAP = \{([^}]*)\}/.exec(workbench)?.[1] ?? '';

    expect(recap).toMatch(/connectable:\s*false/);
  });
});
