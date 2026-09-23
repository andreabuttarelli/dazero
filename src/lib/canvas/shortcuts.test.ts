import { describe, expect, it } from 'vitest';
import {
  CANVAS_SHORTCUTS,
  NUDGE_STEP,
  preventable,
  NUDGE_STEP_BIG,
  addableOf,
  matchCanvasShortcut,
  nudgeOf,
  type CanvasCommand
} from './shortcuts';
import { CANVAS_ADDABLE } from './addable';

/** Un evento tastiera finto: bastano i campi che il registro guarda. */
function ev(
  key: string,
  opts: Omit<Partial<KeyboardEvent>, 'target'> & { target?: unknown } = {}
): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: { tagName: 'DIV', isContentEditable: false },
    ...opts
  } as unknown as KeyboardEvent;
}

const TEXTAREA = { tagName: 'TEXTAREA', isContentEditable: false };
const URL_INPUT = { tagName: 'INPUT', type: 'url', isContentEditable: false };
const TEXT_INPUT = { tagName: 'INPUT', type: 'text', isContentEditable: false };
const EDITABLE = { tagName: 'DIV', isContentEditable: true };

/**
 * IL DIFETTO CHE SI ROMPE PER PRIMO, quindi il test che viene per primo.
 *
 * Sulla tela ci sono `textarea` per i prompt e `input` per gli indirizzi: una scorciatoia che
 * scatta mentre si scrive cancella i nodi selezionati mentre si batte un Backspace dentro una
 * caption. Non è un caso limite — è il gesto più frequente che esista in quei campi.
 */
describe('mentre si scrive, la tela non tocca la tastiera', () => {
  const typing = [TEXTAREA, URL_INPUT, TEXT_INPUT, EDITABLE];
  const keys = ['Backspace', 'Delete', 'Escape', 'a', '1', '2', '3', '4', 'ArrowLeft', '0'];

  for (const target of typing) {
    for (const key of keys) {
      it(`${String(target.tagName)} + "${key}" non fa niente`, () => {
        expect(matchCanvasShortcut(ev(key, { target }))).toBeNull();
      });
    }
  }

  it('nemmeno le combinazioni con modificatore, che nei campi hanno già un senso', () => {
    // ⌘A dentro una textarea seleziona il TESTO, non i nodi. Rubarla sarebbe peggio di un tasto
    // nudo: l'utente la usa apposta, e si ritroverebbe la tela selezionata e il testo no.
    expect(matchCanvasShortcut(ev('a', { metaKey: true, target: TEXTAREA }))).toBeNull();
    expect(matchCanvasShortcut(ev('a', { ctrlKey: true, target: EDITABLE }))).toBeNull();
  });

  it('nemmeno duplica, copia o incolla — ⌘C/⌘V hanno già un senso su un campo', () => {
    expect(matchCanvasShortcut(ev('d', { metaKey: true, target: TEXTAREA }))).toBeNull();
    expect(matchCanvasShortcut(ev('c', { metaKey: true, target: TEXTAREA }))).toBeNull();
    expect(matchCanvasShortcut(ev('v', { metaKey: true, target: TEXTAREA }))).toBeNull();
  });
});

describe('duplicare, copiare, incollare', () => {
  it('⌘D duplica la selezione', () => {
    expect(matchCanvasShortcut(ev('d', { metaKey: true }))).toEqual({ id: 'duplicate' });
    expect(matchCanvasShortcut(ev('d', { ctrlKey: true }))).toEqual({ id: 'duplicate' });
  });

  it('⌘C copia la selezione', () => {
    expect(matchCanvasShortcut(ev('c', { metaKey: true }))).toEqual({ id: 'copy' });
  });

  it('⌘V incolla dove punta lo schermo', () => {
    expect(matchCanvasShortcut(ev('v', { metaKey: true }))).toEqual({ id: 'paste' });
  });

  it('⌘⇧D non è duplica: un secondo tasto sulla stessa lettera confonderebbe', () => {
    expect(matchCanvasShortcut(ev('d', { metaKey: true, shiftKey: true }))).toBeNull();
  });
});

describe('quello che i tasti fanno sulla tela', () => {
  it('Backspace e Delete cancellano la selezione', () => {
    expect(matchCanvasShortcut(ev('Backspace'))?.id).toBe('delete');
    expect(matchCanvasShortcut(ev('Delete'))?.id).toBe('delete');
  });

  it('Esc deseleziona', () => {
    expect(matchCanvasShortcut(ev('Escape'))?.id).toBe('deselect');
  });

  it('⌘A (e Ctrl+A) selezionano tutto', () => {
    expect(matchCanvasShortcut(ev('a', { metaKey: true }))?.id).toBe('select-all');
    expect(matchCanvasShortcut(ev('A', { ctrlKey: true }))?.id).toBe('select-all');
  });

  it('i numeri aggiungono, nello stesso ordine della barra', () => {
    CANVAS_ADDABLE.forEach((what, i) => {
      const m = matchCanvasShortcut(ev(String(i + 1)));
      expect(m?.id).toBe('add');
      expect(addableOf(m as CanvasCommand)).toBe(what);
    });
  });

  it('un numero oltre l’elenco non aggiunge niente', () => {
    expect(matchCanvasShortcut(ev(String(CANVAS_ADDABLE.length + 1)))).toBeNull();
  });

  it('la vista: 0 inquadra tutto, + e - la scala', () => {
    expect(matchCanvasShortcut(ev('0'))?.id).toBe('fit');
    expect(matchCanvasShortcut(ev('+'))?.id).toBe('zoom-in');
    expect(matchCanvasShortcut(ev('='))?.id).toBe('zoom-in');
    expect(matchCanvasShortcut(ev('-'))?.id).toBe('zoom-out');
  });

  it('le frecce spostano la selezione, già in unità di tela', () => {
    // Lo spostamento esce MOLTIPLICATO: se uscisse la sola direzione, il passo verrebbe scelto da
    // chi ascolta, e la tela e la scheda di aiuto direbbero due numeri diversi.
    const s = NUDGE_STEP;
    expect(nudgeOf(matchCanvasShortcut(ev('ArrowLeft')) as CanvasCommand)).toEqual({ dx: -s, dy: 0 });
    expect(nudgeOf(matchCanvasShortcut(ev('ArrowRight')) as CanvasCommand)).toEqual({ dx: s, dy: 0 });
    expect(nudgeOf(matchCanvasShortcut(ev('ArrowUp')) as CanvasCommand)).toEqual({ dx: 0, dy: -s });
    expect(nudgeOf(matchCanvasShortcut(ev('ArrowDown')) as CanvasCommand)).toEqual({ dx: 0, dy: s });
  });

  it('con ⇧ il passo è quello grande', () => {
    const big = nudgeOf(matchCanvasShortcut(ev('ArrowRight', { shiftKey: true })) as CanvasCommand);
    expect(big).toEqual({ dx: NUDGE_STEP_BIG, dy: 0 });
  });
});

/**
 * LE COLLISIONI COL REGISTRO GLOBALE, che è l'altra cosa che si rompe in silenzio: `g` arma una
 * sequenza per tutto il prodotto, `?` apre la scheda di aiuto, ⌘K la palette. Una lettera nuda qui
 * diventerebbe la SECONDA lettera di una sequenza già armata, e il gesto andrebbe a due padroni.
 */
describe('non pesta i piedi al registro globale', () => {
  for (const key of ['g', '?', 'k', 'c', 'l', 's', 'r', 'd', 't', 'h', 'b', 'm', 'w', 'p', 'z']) {
    it(`"${key}" nudo resta del registro globale`, () => {
      expect(matchCanvasShortcut(ev(key))).toBeNull();
    });
  }

  it('⌘K resta la palette', () => {
    expect(matchCanvasShortcut(ev('k', { metaKey: true }))).toBeNull();
  });

  it('⌘, restano le impostazioni', () => {
    expect(matchCanvasShortcut(ev(',', { metaKey: true }))).toBeNull();
  });

  it('Alt non è mai un modificatore nostro: su macOS scrive caratteri veri', () => {
    expect(matchCanvasShortcut(ev('a', { metaKey: true, altKey: true }))).toBeNull();
    expect(matchCanvasShortcut(ev('ArrowLeft', { altKey: true }))).toBeNull();
  });
});

describe('Esc resta degli overlay', () => {
  it('si riconosce come deseleziona, ma non si mangia l\u2019evento', () => {
    // Il registro globale lo dice: Esc lo gestisce ogni overlay per sé. Intercettarlo qui
    // lascerebbe aperto il menù del doppio clic, che con Esc si chiude.
    const esc = matchCanvasShortcut(ev('Escape')) as CanvasCommand;
    expect(esc.id).toBe('deselect');
    expect(preventable(esc)).toBe(false);
  });

  it('tutto il resto invece sì', () => {
    for (const key of ['Backspace', 'Delete', '1', '0', 'ArrowLeft']) {
      expect(preventable(matchCanvasShortcut(ev(key)) as CanvasCommand)).toBe(true);
    }
  });
});

describe('la scheda che le elenca', () => {
  it('elenca ogni comando che i tasti sanno produrre', () => {
    // Una scheda scritta a mano accanto al riconoscimento diverge al primo tasto cambiato, e a
    // divergere è sempre quella che l'utente legge.
    const listed = new Set(CANVAS_SHORTCUTS.map((s) => s.id));
    for (const id of [
      'delete', 'deselect', 'select-all', 'add', 'fit', 'zoom-in', 'zoom-out', 'nudge',
      'duplicate', 'copy', 'paste'
    ]) {
      expect(listed).toContain(id);
    }
  });

  it('ogni riga dice dei tasti e cosa fanno', () => {
    for (const s of CANVAS_SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});
