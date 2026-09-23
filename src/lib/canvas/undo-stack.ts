import type { Gesture } from './undo-plan';

/**
 * LO STACK DI UN CLIENT SOLO — non del database, non dell'utente su tutti i suoi dispositivi.
 * `undo-plan.ts` lo dice in testa al file: due schede della stessa persona hanno due storie
 * diverse, ed è corretto così. Questo modulo è quella storia: una pila di gesti fatti da QUESTA
 * mano, in memoria, che ⌘Z cammina all'indietro e ⇧⌘Z in avanti.
 *
 * POP NON SPOSTA DA SOLO — chi chiama decide se il lato opposto riceve qualcosa, e SOLO dopo che
 * il server ha confermato la scrittura. `popUndo` toglie un gesto dallo stack di undo e basta:
 * se il server lo rifiuta (stale), quel gesto è semplicemente perso, non "spostato e sbagliato".
 * Se lo accetta, chi chiama fa `pushRedo` con IL GESTO CHE IL SERVER RESTITUISCE — non con quello
 * appena tolto: un `node.update` annullato lascia il nodo a una versione nuova, e un redo che si
 * aspettasse la versione di prima troverebbe sempre un conflitto. La stessa cosa, all'incontrario,
 * per `popRedo`/`pushUndo`.
 *
 * UN GESTO NUOVO (`push`) SVUOTA IL REDO: la stessa regola di ogni editor — fare qualcosa dopo un
 * undo rende irraggiungibile quello che era stato annullato più indietro, perché applicarlo di
 * nuovo scriverebbe sopra uno stato che non esiste più.
 */
export type UndoStack = {
  push: (gesture: Gesture) => void;
  popUndo: () => Gesture | null;
  popRedo: () => Gesture | null;
  pushRedo: (gesture: Gesture) => void;
  pushUndo: (gesture: Gesture) => void;
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
    popUndo: () => undo.pop() ?? null,
    popRedo: () => redo.pop() ?? null,
    pushRedo: (gesture: Gesture) => redo.push(gesture),
    pushUndo: (gesture: Gesture) => undo.push(gesture),
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0
  };
}
