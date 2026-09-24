/**
 * LO SPOSTAMENTO, PURO — nessun database. `undo-plan.ts` decide se vale ancora annullare una
 * creazione o una modifica guardando `nodes.version`; qui non c'è una versione da guardare,
 * perché `moveNode` (`repos/canvas.ts`) è last-write-wins e non scrive `canvas_events` — la
 * stessa scelta, dichiarata lì, che rende uno spostamento non un evento strutturale. Annullarlo
 * resta possibile, ma con la sua propria domanda: la posizione ATTUALE è ancora quella che questo
 * gesto ha lasciato, o un collega ha già trascinato lo stesso nodo altrove?
 *
 * UN GESTO SOLO PER UN TRASCINAMENTO DI PIÙ NODI: la stessa regola di `undo-plan.ts::Gesture` —
 * annullarne metà (tre nodi tornano al loro posto, un quarto resta dove un peer l'ha spostato
 * senza che nessuno lo sappia) è peggio di non annullare niente. Se anche un solo nodo del gesto
 * non è più dov'era, il gesto INTERO si rifiuta, prima di scrivere qualunque cosa.
 */

export type Point = { x: number; y: number };

export type MoveItem = { nodeId: string; before: Point; after: Point };

export type MoveGesture = { kind: 'move'; items: MoveItem[] };

export type MoveStaleReason = 'node_moved_by_peer' | 'node_deleted_by_peer';

export type MoveGestureCheck = { outcome: 'ok' } | { outcome: 'stale'; reason: MoveStaleReason };

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/**
 * `currentOf` legge la posizione FRESCA di un nodo — quella che il client tiene allineata via
 * realtime, non quella che il gesto ricordava — e risponde `null` se il nodo non c'è più.
 */
export function checkMoveGesture(gesture: MoveGesture, currentOf: (nodeId: string) => Point | null): MoveGestureCheck {
  for (const item of gesture.items) {
    const current = currentOf(item.nodeId);
    if (!current) {
      return { outcome: 'stale', reason: 'node_deleted_by_peer' };
    }
    if (!samePoint(current, item.after)) {
      return { outcome: 'stale', reason: 'node_moved_by_peer' };
    }
  }
  return { outcome: 'ok' };
}

/** L'inversa di un gesto di spostamento: ogni nodo torna a `before`. Il redo è lo stesso gesto
 *  con `before`/`after` scambiati — uno spostamento non ha una versione da far avanzare. */
export function inverseMoveGesture(gesture: MoveGesture): MoveGesture {
  return { kind: 'move', items: gesture.items.map((item) => ({ nodeId: item.nodeId, before: item.after, after: item.before })) };
}
