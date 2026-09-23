import type { Gesture } from './undo-plan';

/**
 * LO STACK DI UN CLIENT SOLO — non del database, non dell'utente su tutti i suoi dispositivi.
 * `undo-plan.ts` lo dice in testa al file: due schede della stessa persona hanno due storie
 * diverse, ed è corretto così. Questo modulo è quella storia: una pila di gesti fatti da QUESTA
 * mano, in memoria, che ⌘Z cammina all'indietro e ⇧⌘Z in avanti.
 *
 * OGNI POP APPLICA — NON RIMUOVE E BASTA. `pop` non decide se il gesto va ancora bene (quello è
 * `checkGesture`, lato server): sposta il gesto dallo stack di undo a quello di redo e lo
 * restituisce a chi chiama, che tenta la scrittura. Se il server rifiuta (stale), chi chiama non
 * lo rimette nello stack di redo con `pushRedo` — un gesto rifiutato non deve poter tornare con
 * ⇧⌘Z, perché le sue premesse sono già cadute una volta.
 *
 * UN GESTO NUOVO SVUOTA IL REDO: la stessa regola di ogni editor — fare qualcosa dopo un undo
 * rende irraggiungibile quello che era stato annullato più indietro, perché applicarlo di nuovo
 * scriverebbe sopra uno stato che non esiste più.
 */
export type UndoStack = {
  push: (gesture: Gesture) => void;
  popUndo: () => Gesture | null;
  popRedo: () => Gesture | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export function createUndoStack(): UndoStack {
  const undo: Gesture[] = [];
  const redo: Gesture[] = [];

  return {
    push(gesture: Gesture) {
      undo.push(gesture);
      redo.length = 0;
    },
    popUndo(): Gesture | null {
      const gesture = undo.pop();
      if (!gesture) {
        return null;
      }
      redo.push(gesture);
      return gesture;
    },
    popRedo(): Gesture | null {
      const gesture = redo.pop();
      if (!gesture) {
        return null;
      }
      undo.push(gesture);
      return gesture;
    },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0
  };
}
