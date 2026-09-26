/**
 * LO STATO DI UN NODO CHE SCARICA, in un posto solo: `products` e `social_account_feed` lo
 * condividono, ed è per questo che non vive dentro nessuno dei due — un `if` sullo stato scritto
 * due volte diverge al primo cambio, in silenzio e solo su uno dei due nodi.
 *
 * NON È `gen-history.ts`: quello governa un giro che genera (prompt, modello, un provider che può
 * restare in coda). Qui non c'è niente da generare — il giro finisce dentro la stessa richiesta —
 * quindi non c'è coda, non c'è `run_id` da rincorrere. C'è solo "sta scaricando / ha finito / ha
 * fallito con un motivo leggibile", la stessa forma di `genState` in `node-data.ts` ma senza il
 * suo apparato.
 */
export const SYNC_STATUSES = ['idle', 'running', 'done', 'failed'] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

export type SyncNode = {
  syncStatus: SyncStatus;
  syncError: string | null;
  syncedCount: number;
  syncedAt: string | null;
};

/** Perché il bottone "Sincronizza" è spento, o null quando può partire. */
export function syncBlockedReason(node: SyncNode): string | null {
  if (node.syncStatus === 'running') {
    return 'Sta scaricando…';
  }
  return null;
}

export function canStartSync(node: SyncNode): boolean {
  return syncBlockedReason(node) === null;
}
