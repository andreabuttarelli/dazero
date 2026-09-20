import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = readFileSync(join(import.meta.dirname, '+page.svelte'), 'utf8');

/**
 * SPOSTARE UNA TILE DEVE SCRIVERLA, E UN FALLIMENTO DEVE DIRSI.
 *
 * Il difetto vero: `fetch('?/move')` senza l'intestazione `x-sveltekit-action` non è una chiamata
 * a una action — SvelteKit la tratta come l'invio di un form non potenziato e risponde con un
 * **303 verso la pagina**. `fetch` segue il redirect da solo, torna l'HTML della pagina con
 * `res.ok === true`, e il client conclude che ha salvato. La tabella resta vuota e nessuno lo sa:
 * misurato in produzione, 1 tela e 0 tile dopo giorni di trascinamenti.
 *
 * `res.ok` non è quindi una prova di niente: una action risponde 200 anche quando rifiuta, e
 * risponde 200 anche quando non è stata nemmeno invocata. Quello che dice com'è andata è il corpo
 * (`type: 'success' | 'failure' | 'error'`), che va deserializzato.
 */
describe('il trascinamento salva davvero', () => {
  it('chiede una action, con l’intestazione che la distingue da un form', () => {
    expect(
      PAGE,
      'senza x-sveltekit-action SvelteKit risponde 303 e fetch segue il redirect: salvataggio mai avvenuto'
    ).toContain('x-sveltekit-action');
  });

  it('legge l’esito dal corpo, non da res.ok', () => {
    expect(
      PAGE,
      'una action risponde 200 anche quando rifiuta: res.ok da solo dichiara salvato un fallimento'
    ).toContain('deserialize');
  });

  it('non si fida di res.ok come unica prova del salvataggio', () => {
    expect(PAGE).not.toMatch(/failed = res\.ok \? null :/);
  });
});
