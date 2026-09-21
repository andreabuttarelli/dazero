/**
 * LE SCORCIATOIE DELLA TELA — quale tasto significa cosa, e soprattutto QUANDO non significa
 * niente. Il riconoscimento sta qui, l'esecuzione resta di chi ha la tela: la stessa divisione di
 * `$lib/shortcuts.ts`, che è il registro globale del prodotto.
 *
 * DUE REGISTRI E NON UNO, di proposito. Quello globale decide dove si va (`g` + lettera, ⌘K); qui
 * si decide cosa si fa a ciò che è selezionato, e la differenza è che questi tasti hanno senso
 * solo mentre si guarda una tela. Metterli lassù vorrebbe dire una scheda di aiuto che elenca
 * «sposta la selezione» su ogni pagina del prodotto, dove una selezione non esiste.
 *
 * LA SCELTA DEI TASTI, e cosa è stato scartato:
 *
 *   Nessuna LETTERA NUDA. Il registro globale usa `g` come prefisso: dopo `g`, QUALUNQUE lettera
 *   è la seconda di una sequenza (`matchShortcut` lo dice esplicitamente). Una `d` nuda qui
 *   sarebbe «duplica» e insieme la seconda lettera di una `g d`, e a decidere sarebbe l'ordine in
 *   cui due ascoltatori su `window` ricevono lo stesso evento. Un gesto, due padroni: scartata.
 *
 *   DUPLICARE non c'è. ⌘D è del browser (segnalibro) e il registro globale lo dichiara già preso;
 *   ⌘⇧D sarebbe libero, ma duplicare una tile vuol dire scrivere una riga nuova nel database, e
 *   quella scrittura oggi non esiste. Un tasto che copia solo il disegno darebbe una tile che
 *   sparisce alla prossima apertura: peggio di un tasto che non c'è, perché il lavoro perso si
 *   scopre dopo. Il tasto si aggiunge il giorno che la scrittura esiste, non prima.
 *
 *   Backspace e Delete per cancellare, com'è su ogni tela che esista. Il ritorno alla pagina
 *   precedente su Backspace è stato tolto da Chrome nel 2016 e non è mai esistito su Safari.
 *
 *   I NUMERI per aggiungere, nell'ordine in cui la barra mostra le voci: `1` è la prima. Una
 *   lettera per tipo (`t`/`i`/`v`/`p`) sarebbe più mnemonica e cadrebbe nella collisione con `g`.
 *
 * ESC NON SI INTERCETTA. Il registro globale lo dice esplicitamente: Esc lo gestisce ogni overlay
 * per sé, e un `preventDefault` centrale lo ruberebbe a menu, dropdown e campi. Qui si riconosce
 * come «deseleziona» — perché è quello che significa su una tela — ma `preventable` lo esclude,
 * così il menù del doppio clic continua a chiudersi con lo stesso tasto.
 *
 * PERCHÉ CANCELLARE NON CHIEDE CONFERMA. La conferma protegge da ciò che non si può disfare, e su
 * una tela il pentimento ha già la sua strada: il nodo si riaggiunge con un tasto, ed è lo stesso
 * gesto che l'ha creato. Una finestra modale a ogni Backspace costa un'interruzione su ogni
 * cancellazione voluta — che sono quasi tutte — per salvare quella sbagliata, che si ripara in un
 * secondo. Quello che questa scelta ESIGE è che il tasto non scatti mentre si scrive: è l'unico
 * caso in cui la cancellazione arriva senza essere stata chiesta, ed è il primo test del file.
 */
import { isTypingTarget } from '$lib/shortcuts';
import { CANVAS_ADDABLE, ADDABLE_LABEL, type Addable } from './addable';

/** Di quante unità di tela sposta una freccia, e quanto con Shift. */
export const NUDGE_STEP = 8;
export const NUDGE_STEP_BIG = 64;

export type CanvasCommandId =
  | 'delete'
  | 'deselect'
  | 'select-all'
  | 'add'
  | 'fit'
  | 'zoom-in'
  | 'zoom-out'
  | 'nudge';

/**
 * Il comando riconosciuto. `add` e `nudge` portano con sé il loro argomento perché è il tasto a
 * deciderlo: `1` non è «aggiungi» più un parametro letto altrove, è «aggiungi un testo».
 */
export type CanvasCommand =
  | { id: 'add'; what: Addable }
  | { id: 'nudge'; dx: number; dy: number }
  | { id: Exclude<CanvasCommandId, 'add' | 'nudge'> };

/** L'argomento di `add`, per chi ha in mano un comando e non sa ancora quale sia. */
export function addableOf(c: CanvasCommand): Addable | null {
  return c.id === 'add' ? c.what : null;
}

/** Di quanto spostare, in unità di tela. null se il comando non è uno spostamento. */
export function nudgeOf(c: CanvasCommand): { dx: number; dy: number } | null {
  return c.id === 'nudge' ? { dx: c.dx, dy: c.dy } : null;
}

const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 }
};

const ZOOM_IN_KEYS = ['+', '='];

/**
 * Da un evento al comando, o null. `null` non è «non so»: è «questo evento non è mio», e chi
 * ascolta deve lasciarlo passare intatto — dentro un campo di testo è l'unica risposta giusta.
 */
export function matchCanvasShortcut(e: KeyboardEvent): CanvasCommand | null {
  // Alt fuori sempre: su macOS ⌥+lettera scrive un carattere vero, e intercettarlo lo mangia.
  if (e.altKey) return null;

  // Mentre si scrive nessun tasto è nostro, nemmeno quelli con modificatore: ⌘A dentro una
  // textarea seleziona il testo, ed è quello che l'utente sta chiedendo.
  if (isTypingTarget(e.target)) return null;

  const mod = e.metaKey || e.ctrlKey;
  const key = e.key;

  if (mod) {
    if (key.toLowerCase() === 'a' && !e.shiftKey) return { id: 'select-all' };
    // Tutto il resto con modificatore è del browser o del registro globale (⌘K, ⌘,).
    return null;
  }

  if (key === 'Backspace' || key === 'Delete') return { id: 'delete' };
  if (key === 'Escape') return { id: 'deselect' };

  const arrow = ARROWS[key];
  if (arrow) {
    const step = e.shiftKey ? NUDGE_STEP_BIG : NUDGE_STEP;
    return { id: 'nudge', dx: arrow.dx * step, dy: arrow.dy * step };
  }

  if (key === '0') return { id: 'fit' };
  if (ZOOM_IN_KEYS.includes(key)) return { id: 'zoom-in' };
  if (key === '-') return { id: 'zoom-out' };

  const slot = Number(key);
  if (Number.isInteger(slot) && slot >= 1 && slot <= CANVAS_ADDABLE.length) {
    return { id: 'add', what: CANVAS_ADDABLE[slot - 1] };
  }

  return null;
}

/**
 * Questo comando può mangiarsi l'evento? Tutti sì tranne Esc, che appartiene agli overlay. Una
 * domanda e non un `if` dentro chi ascolta: chi esegue non deve ricordarsi l'eccezione.
 */
export function preventable(c: CanvasCommand): boolean {
  return c.id !== 'deselect';
}

export type CanvasShortcutRow = { id: CanvasCommandId; keys: string[]; label: string };

/**
 * La scheda che le elenca, DERIVATA dallo stesso elenco che i tasti usano: le voci di `add` sono
 * i tipi aggiungibili, nel loro ordine, quindi un quinto tipo compare qui da solo. Una lista
 * scritta a mano accanto al riconoscimento diverge al primo tasto cambiato, e a divergere è
 * sempre quella che l'utente legge.
 */
export const CANVAS_SHORTCUTS: readonly CanvasShortcutRow[] = [
  ...CANVAS_ADDABLE.map((what, i) => ({
    id: 'add' as const,
    keys: [String(i + 1)],
    label: `Aggiungi: ${ADDABLE_LABEL[what]}`
  })),
  { id: 'delete', keys: ['⌫'], label: 'Elimina la selezione' },
  { id: 'select-all', keys: ['mod', 'A'], label: 'Seleziona tutto' },
  { id: 'deselect', keys: ['Esc'], label: 'Deseleziona' },
  { id: 'nudge', keys: ['←', '↑', '↓', '→'], label: 'Sposta la selezione (⇧ di più)' },
  { id: 'fit', keys: ['0'], label: 'Inquadra tutto' },
  { id: 'zoom-in', keys: ['+'], label: 'Ingrandisci' },
  { id: 'zoom-out', keys: ['-'], label: 'Rimpicciolisci' }
];
