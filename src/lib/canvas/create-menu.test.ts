import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * IL MENÙ DEL DOPPIO CLIC DEVE POTERSI APRIRE.
 *
 * La conversione schermo → tela arriva da `CanvasPointer`, che vive DENTRO `SvelteFlow` perché
 * `useSvelteFlow` legge il contesto che solo lui apre. La porta fuori assegnando una funzione al
 * genitore — e lì sta il difetto che questo test guarda: assegnarla a un `let` semplice la scrive
 * in una variabile che il gestore del doppio clic ha già catturato, quindi `openMenu` continua a
 * vedere `null` e il menù non compare MAI. Con `$state` il valore assegnato dopo il mount è quello
 * che il gestore legge davvero.
 *
 * Si legge il sorgente perché il difetto è di reattività, non di logica: montare il componente
 * direbbe che non è esploso, non che il doppio clic apre qualcosa.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const flow = readFileSync(
  join(dir, '..', 'components', 'canvas', 'CanvasFlow.svelte'),
  'utf8'
);

describe('il menù per aggiungere un nodo', () => {
  it('tiene la conversione in uno stato reattivo, o non si apre mai', () => {
    const decl = /let toFlow\s*=\s*[^\n]*/.exec(flow)?.[0] ?? '';

    // `$state<...>(...)` o `$state(...)`: quel che conta è che la rune ci sia.
    expect(decl).toMatch(/\$state[<(]/);
  });

  it('si apre col doppio clic sulla tela', () => {
    expect(flow).toMatch(/ondblclick=\{openMenu\}/);
  });

  it('offre i tre medium che un nodo può produrre', () => {
    expect(flow).toMatch(/#each GEN_MEDIUMS as medium/);
  });

  it('non ruba il doppio clic fatto sopra una tile', () => {
    // Su un nodo il doppio clic è un gesto suo: aprirci sopra il menù di creazione lo mangerebbe.
    expect(flow).toMatch(/closest\('\.svelte-flow__node'\)/);
  });
});
