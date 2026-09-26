/**
 * L'INVERSA DI UN GESTO, E SE VALE ANCORA APPLICARLA — PURO, SENZA DATABASE.
 *
 * LA STORIA È DEL CLIENT, NON DEL SERVER. Ogni scheda/dispositivo tiene il proprio elenco di
 * gesti fatti da QUELLA mano, in memoria, in ordine — Ctrl+Z cammina quella lista, non interroga
 * `canvas_events` cercando "l'ultimo evento di questo utente". Due schede della stessa persona
 * hanno due storie diverse, ed è corretto così: l'undo segue la mano che ha fatto la cosa, non
 * l'account. `canvas_events` resta un registro — la traccia per "Marco ha spostato 3 nodi" e il
 * recupero di un nodo cancellato per sbaglio — non il meccanismo che questo file guida.
 *
 * L'APPLICAZIONE È UNA SCRITTURA ORDINARIA. Annullare un gesto scrive su `nodes`/`nodes_connections`
 * con la STESSA concorrenza ottimistica, lo stesso soft-delete, la stessa propagazione realtime di
 * qualunque altra modifica — non un protocollo a parte. Questo file decide SOLO due cose: qual è
 * l'inversa di un gesto, e se le sue premesse valgono ancora adesso.
 *
 * LE PREMESSE POSSONO ESSERE CADUTE MENTRE IL GESTO ASPETTAVA NELLO STACK: un collega ha
 * cambiato lo stesso nodo (la versione attesa non torna più), o l'ha cancellato, o ha agganciato
 * connessioni a un nodo che questo gesto vorrebbe far sparire. `checkPrecondition` guarda lo
 * STATO FRESCO del server (letto adesso, non quello che il client ricordava) e risponde `ok` o
 * `stale` con un motivo leggibile — MAI un successo silenzioso che scavalca il lavoro di un
 * altro, e mai un no-op muto che l'utente scambia per "ha funzionato".
 */

export type GestureKind = 'node.create' | 'node.update' | 'node.delete' | 'edge.create' | 'edge.delete';

export type ActorKind = 'user' | 'agent' | 'system';

/**
 * UN'AZIONE FATTA: quello che uno stack client-side tiene per un singolo write. Rispecchia la
 * riga che `recordEvent` scrive su `canvas_events` (stesso prodotto, due consumatori: l'audit
 * trail sul server, lo stack di undo sul client) ma non È quella riga — un client non ha bisogno
 * dell'`id` bigserial per annullare, solo di prima/dopo e su cosa.
 */
export type UndoItem =
  | { kind: 'node.create'; nodeId: string; after: Record<string, unknown> }
  | { kind: 'node.update'; nodeId: string; before: Record<string, unknown>; after: Record<string, unknown>; expectedVersion: number }
  | { kind: 'node.delete'; nodeId: string; before: Record<string, unknown> }
  | { kind: 'edge.create'; edgeId: string; sourceNodeId: string; targetNodeId: string }
  | { kind: 'edge.delete'; edgeId: string; sourceNodeId: string; targetNodeId: string };

/**
 * UN GESTO: uno o più `UndoItem` che un solo Ctrl+Z tratta come un'unità. Il cambio di modello
 * che sgancia connessioni (`connectors.ts::orphanedByModelChange`) è un `node.update` più N
 * `edge.delete` — un gesto da due o più item, mai due entry separate nello stack: annullarlo a
 * metà (il modello torna indietro ma le linee restano tagliate, o viceversa) è peggio di non
 * annullare niente.
 */
export type Gesture = { items: UndoItem[] };

export type InverseWrite =
  | { op: 'delete_node'; nodeId: string }
  | { op: 'restore_node'; nodeId: string; data: Record<string, unknown> }
  | { op: 'write_node_data'; nodeId: string; data: Record<string, unknown>; expectedVersion: number }
  | { op: 'delete_edge'; edgeId: string }
  | { op: 'restore_edge'; edgeId: string };

/**
 * OGNI RIGA È L'INVERSA DI UN `kind`, IN UN POSTO SOLO — la tabella che CLAUDE.md chiede invece
 * di un `if (kind === …)` sparso. Un gesto nuovo è una riga qui, non una catena di condizioni.
 */
export function inverseOf(item: UndoItem): InverseWrite {
  switch (item.kind) {
    case 'node.create':
      // Disfare una nascita è farla sparire di nuovo: soft-delete, non hard — la stessa regola
      // di `deleteNode`, e il redo di questo undo ritrova la riga intatta.
      return { op: 'delete_node', nodeId: item.nodeId };
    case 'node.delete':
      return { op: 'restore_node', nodeId: item.nodeId, data: item.before };
    case 'node.update':
      return { op: 'write_node_data', nodeId: item.nodeId, data: item.before, expectedVersion: item.expectedVersion };
    case 'edge.create':
      return { op: 'delete_edge', edgeId: item.edgeId };
    case 'edge.delete':
      return { op: 'restore_edge', edgeId: item.edgeId };
  }
}

/** Lo stato fresco che una precondizione confronta con quello che il gesto ricordava. */
export type CurrentNodeState = { exists: true; version: number; connectedBy: string[] } | { exists: false };
export type CurrentEdgeState = { exists: boolean };

export type PreconditionResult = { outcome: 'ok' } | { outcome: 'stale'; reason: StaleReason };

export type StaleReason =
  | 'node_changed_by_peer'
  | 'node_deleted_by_peer'
  | 'node_gained_peer_connections'
  | 'edge_already_gone'
  | 'edge_missing_endpoint';

/**
 * VALE ANCORA APPLICARE QUESTO ITEM? Tre premesse cadono mentre un gesto aspetta nello stack, e
 * ognuna ha una riga qui, non un `if` a sé:
 *
 *   node.update  la versione che il gesto si aspettava non è più quella sul server → un collega
 *                ha scritto lo stesso nodo nel frattempo. Forzare `before` sopra sarebbe la
 *                stessa scrittura senza `version` che `writeNodeData` esiste per impedire — non
 *                si fa MAI, si segnala.
 *   node.delete / node.create (la loro inversa tocca un nodo che potrebbe non esserci più)
 *                il nodo è già sparito → l'entry è vecchia, si scarta con un motivo leggibile,
 *                mai un no-op silenzioso.
 *   node.create  annullarlo lo cancella (soft) — se nel frattempo un collega ci ha agganciato un
 *                arco, la cancellazione si porterebbe via lavoro che non è di chi preme Ctrl+Z.
 *                `connectedBy` isola quelle connessioni: se ne porta almeno una che l'item non
 *                conosceva già, non si cancella in silenzio — si dice all'utente cosa cadrebbe.
 *   edge.delete  l'arco che l'inversa dovrebbe far rinascere non c'è più (un peer l'ha già
 *                cancellato per altre vie, o uno dei due nodi è sparito) → stale.
 *   edge.create  l'arco che l'inversa dovrebbe togliere è già sparito → stale, non un errore: il
 *                risultato che questo undo voleva è già lo stato attuale.
 */
export function checkPrecondition(
  item: UndoItem,
  current: { node?: CurrentNodeState; edge?: CurrentEdgeState }
): PreconditionResult {
  switch (item.kind) {
    case 'node.update': {
      const node = current.node;
      if (!node || !node.exists) {
        return { outcome: 'stale', reason: 'node_deleted_by_peer' };
      }
      if (node.version !== item.expectedVersion) {
        return { outcome: 'stale', reason: 'node_changed_by_peer' };
      }
      return { outcome: 'ok' };
    }
    case 'node.delete': {
      const node = current.node;
      if (!node || !node.exists) {
        return { outcome: 'stale', reason: 'node_deleted_by_peer' };
      }
      return { outcome: 'ok' };
    }
    case 'node.create': {
      const node = current.node;
      if (!node || !node.exists) {
        return { outcome: 'stale', reason: 'node_deleted_by_peer' };
      }
      if (node.connectedBy.length > 0) {
        return { outcome: 'stale', reason: 'node_gained_peer_connections' };
      }
      return { outcome: 'ok' };
    }
    case 'edge.delete': {
      const edge = current.edge;
      if (!edge || !edge.exists) {
        return { outcome: 'stale', reason: 'edge_already_gone' };
      }
      return { outcome: 'ok' };
    }
    case 'edge.create': {
      const edge = current.edge;
      if (!edge || !edge.exists) {
        return { outcome: 'stale', reason: 'edge_already_gone' };
      }
      return { outcome: 'ok' };
    }
  }
}

export type GestureCheck =
  | { outcome: 'ok'; writes: InverseWrite[] }
  | { outcome: 'stale'; reason: StaleReason; item: UndoItem };

/**
 * IL GESTO INTERO, O NIENTE. Un `node.update` più N `edge.delete` (il cambio di modello) si
 * annulla come un'unità: se anche un solo item del gruppo è caduto, l'intero gesto si rifiuta
 * PRIMA di scrivere qualunque cosa — mai metà gesto applicato e metà no, che è lo stato peggiore
 * di tutti (un modello tornato indietro con le connessioni ancora tagliate, o viceversa).
 */
export function checkGesture(
  gesture: Gesture,
  currentOf: (item: UndoItem) => { node?: CurrentNodeState; edge?: CurrentEdgeState }
): GestureCheck {
  for (const item of gesture.items) {
    const result = checkPrecondition(item, currentOf(item));
    if (result.outcome === 'stale') {
      return { outcome: 'stale', reason: result.reason, item };
    }
  }
  return { outcome: 'ok', writes: gesture.items.map(inverseOf) };
}
