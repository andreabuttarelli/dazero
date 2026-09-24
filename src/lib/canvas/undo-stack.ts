/**
 * LO STACK DI UN CLIENT SOLO — non del database, non dell'utente su tutti i suoi dispositivi.
 * `undo-plan.ts` lo dice in testa al file: due schede della stessa persona hanno due storie
 * diverse, ed è corretto così. Questo modulo è quella storia: una pila di gesti fatti da QUESTA
 * mano, in memoria, che ⌘Z cammina all'indietro e ⇧⌘Z in avanti.
 *
 * GENERICO SU COSA TIENE, DI PROPOSITO: un gesto che passa dal server (`Gesture`/`UndoItem`,
 * `undo-plan.ts`) e uno spostamento puramente client-side (`MoveGesture`, `move-gesture.ts` —
 * nessuna riga in `canvas_events`, nessuna versione da controllare) sono voci diverse di UNA
 * cronologia sola: spostare un nodo e poi crearne un altro, ⌘Z deve annullare la creazione prima
 * e lo spostamento poi, nell'ordine in cui sono successi — non due storie separate che l'utente
 * dovrebbe sapere in quale annullare. `+page.svelte` tiene un solo `createUndoStack<StackEntry>`,
 * dove `StackEntry` è l'unione dei due.
 *
 * POP NON SPOSTA DA SOLO — chi chiama decide se il lato opposto riceve qualcosa, e SOLO dopo che
 * la scrittura è confermata. `popUndo` toglie un elemento dallo stack di undo e basta: se la
 * scrittura è rifiutata (stale), quell'elemento è semplicemente perso, non "spostato e sbagliato".
 * Se è accettata, chi chiama fa `pushRedo` con L'ELEMENTO CHE LA SCRITTURA HA PRODOTTO — non con
 * quello appena tolto: un `node.update` annullato lascia il nodo a una versione nuova, e un redo
 * che si aspettasse la versione di prima troverebbe sempre un conflitto. La stessa cosa,
 * all'incontrario, per `popRedo`/`pushUndo`.
 *
 * UN GESTO NUOVO (`push`) SVUOTA IL REDO: la stessa regola di ogni editor — fare qualcosa dopo un
 * undo rende irraggiungibile quello che era stato annullato più indietro, perché applicarlo di
 * nuovo scriverebbe sopra uno stato che non esiste più.
 */
export type UndoStack<T> = {
  push: (entry: T) => void;
  popUndo: () => T | null;
  popRedo: () => T | null;
  pushRedo: (entry: T) => void;
  pushUndo: (entry: T) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export function createUndoStack<T>(): UndoStack<T> {
  const undo: T[] = [];
  const redo: T[] = [];

  return {
    push(entry: T) {
      undo.push(entry);
      redo.length = 0;
    },
    popUndo: () => undo.pop() ?? null,
    popRedo: () => redo.pop() ?? null,
    pushRedo: (entry: T) => redo.push(entry),
    pushUndo: (entry: T) => undo.push(entry),
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0
  };
}
