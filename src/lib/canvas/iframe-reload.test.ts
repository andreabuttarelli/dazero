import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * UN'ANTEPRIMA NON DEVE RIPARTIRE DA CAPO DA SOLA.
 *
 * Il ciclo: il `ResizeObserver` scrive una misura NUOVA a ogni battuta — `{width, height}` è un
 * oggetto diverso anche quando i due numeri sono identici — quindi `frameStyle` si ricalcola,
 * l'attributo `style` dell'iframe viene riscritto, il browser rifà il layout e l'observer
 * riscatta. La pagina incorporata riparte all'infinito.
 *
 * La cura è confrontare i NUMERI prima di scrivere: un `ResizeObserver` che riceve la stessa
 * misura non deve toccare niente. Vale per ogni observer che scrive in uno stato che influenza
 * la geometria di ciò che osserva, ed è il difetto classico di questo schema.
 */
const frame = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'canvas', 'IframeNode.svelte'),
  'utf8'
);

describe("l'anteprima incorporata", () => {
  it('non riscrive la misura quando non è cambiata', () => {
    const callback = /new ResizeObserver\(([\s\S]*?)\n\s*\}\);/.exec(frame)?.[0] ?? '';

    expect(callback).toMatch(/===|Math\.abs|if \(/);
  });

  it('non ha nulla che si riarmi a ogni ridisegno', () => {
    // `loading="lazy"` su una tela è la stessa trappola: pan e zoom lo fanno rientrare nel
    // viewport di continuo, e ogni rientro è un caricamento.
    expect(frame).not.toMatch(/loading="lazy"/);
  });
});

describe('scrivere il codice di un embed', () => {
  it('non ricarica la pagina a ogni tasto', () => {
    // `srcdoc` legato al valore che si sta digitando ricarica l'anteprima a OGNI carattere: un
    // embed di YouTube incollato a mano è un centinaio di ricariche. È lo stesso difetto che
    // l'indirizzo aveva già risolto tenendo una bozza locale, e che il codice non aveva.
    const textarea = /class="frame-code"[\s\S]*?><\/textarea>/.exec(frame)?.[0] ?? '';

    expect(textarea).not.toMatch(/oninput=\{\(e\) => onchange/);
  });

  it("l'anteprima mostra l'ultimo codice confermato, non quel che si sta scrivendo", () => {
    expect(frame).toMatch(/srcdoc=\{(?!node\.html\})/);
  });
});

describe("l'observer che misura il riquadro", () => {
  it('non si riaggancia a ogni misura che scrive', () => {
    // `$effect` traccia OGNI stato letto nel suo corpo, callback comprese: leggere `measured` per
    // confrontarlo lo rende una dipendenza dell'effect, quindi ogni scrittura stacca l'observer e
    // ne aggancia uno nuovo — e agganciare un observer fa scattare una misura iniziale. Il
    // confronto pensato per CHIUDERE il ciclo lo teneva aperto da un'altra parte.
    const body = /\$effect\(\(\) => \{[\s\S]*?\n  \}\);/.exec(frame)?.[0] ?? '';

    expect(body).toMatch(/untrack|\.width\b(?![\s\S]*measured\.width === )/);
    expect(body).not.toMatch(/if \(measured\.width === /);
  });
});
