import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * IL WORKBENCH PRENDE TUTTA L'AREA CONTENUTO, e nient'altro: la barra laterale e la topbar
 * restano dove sono, come in ogni altra pagina del brand.
 *
 * Il guscio incolonna il contenuto e gli mette attorno un padding — giusto per una pagina di
 * testo, sbagliato per una tela, che si impagina da sé e vuole i suoi bordi. Il meccanismo per
 * dirlo esiste già ed è `calendar-flush`: toglie `max-width` e padding SENZA toccare il resto
 * della shell, che è precisamente la differenza con `isFullWidth` (quello smonta anche la
 * sidebar, e serve al checkout e all'editor a tutto schermo).
 *
 * Si legge il SORGENTE invece di montare il componente perché è così che il difetto si presenta:
 * non un errore, ma una tela con un margine attorno e uno scroll che non è il suo.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(join(dir, '+layout.svelte'), 'utf8');

describe("il workbench dentro l'area contenuto", () => {
  it('toglie colonna e padding al contenuto, come fa il calendario', () => {
    const flush = /class:calendar-flush=\{([^}]*)\}/g;
    const uses = [...layout.matchAll(flush)].map((m) => m[1]);

    expect(uses.some((u) => u.includes('isWorkbench'))).toBe(true);
  });

  it('NON smonta la barra laterale: quella resta come nelle altre pagine', () => {
    const fullWidth = /const isFullWidth = \$derived\(([\s\S]*?)\);/.exec(layout)?.[1] ?? '';

    expect(fullWidth).not.toMatch(/isWorkbench/);
  });

  it('lo dice anche allo scheletro, o la tela scatta appena arriva', () => {
    // Lo scheletro di navigazione e la pagina vera vivono in due rami diversi dello stesso
    // `{#key}`. Se solo il secondo è flush, alla fine di OGNI navigazione il contenuto salta di
    // un padding — il difetto si vede solo navigando, mai aprendo la pagina diretta.
    const shimmerFlush = /class:calendar-flush=\{navToFlush\}/.test(layout);
    const navToFlush = /const navToFlush = \$derived\(([\s\S]*?)\);/.exec(layout)?.[1] ?? '';

    expect(shimmerFlush).toBe(true);
    expect(navToFlush).toMatch(/workbench/);
  });

  it('riconosce il workbench dal suo percorso, non da quelli che gli stanno sotto', () => {
    const line = /const isWorkbench = \$derived\((.*)\);/.exec(layout)?.[1] ?? '';

    expect(line).toMatch(/endsWith\('\/workbench'\)|workbench\\?\/\?\$/);
  });
});
