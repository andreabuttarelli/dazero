import type { Db } from '$lib/server/db/client';
import type { Actor } from '$lib/server/repos/actor';
import {
  deleteConnection,
  deleteNode,
  findNode,
  listConnections,
  restoreConnection,
  restoreNode,
  writeNodeData
} from '$lib/server/repos/canvas';
import {
  checkGesture,
  type CurrentEdgeState,
  type CurrentNodeState,
  type Gesture,
  type InverseWrite,
  type StaleReason,
  type UndoItem
} from '$lib/canvas/undo-plan';

/**
 * L'ESECUZIONE DI UN GESTO DI UNDO, LATO SERVER.
 *
 * `checkGesture` (puro, `undo-plan.ts`) decide se applicare o rifiutare; questo file legge lo
 * STATO FRESCO che quella funzione confronta e applica le `InverseWrite` con GLI STESSI repo di
 * ogni altra scrittura (`writeNodeData`, `deleteNode`, `restoreNode`, `deleteConnection`,
 * `restoreConnection`) — quindi con la stessa concorrenza ottimistica, lo stesso soft-delete, e la
 * stessa riga in `canvas_events`, attribuita a chi preme Ctrl+Z. Un undo non è un protocollo a
 * parte: è una scrittura ordinaria la cui inversa è già stata calcolata.
 *
 * `connectedBy` (per `node.create`) guarda solo gli archi VIVI verso quel nodo che questo stesso
 * gesto non conosce già: un `edge.create` nello stesso gesto (raro, ma il tipo lo permette) non
 * conta come "un collega si è agganciato", perché quell'arco fa parte del gesto che si sta
 * annullando, non del lavoro di qualcun altro.
 */
export type UndoOutcome =
  | { outcome: 'undone' }
  | { outcome: 'refused'; reason: StaleReason };

async function currentNodeState(db: Db, orgId: string, nodeId: string, ownEdgeIds: Set<string>): Promise<CurrentNodeState> {
  const node = await findNode(db, { orgId, nodeId });
  if (!node) {
    return { exists: false };
  }

  const edges = await listConnections(db, { orgId, canvasId: node.canvasId });
  const connectedBy = edges
    .filter((edge) => edge.targetNodeId === nodeId && !ownEdgeIds.has(edge.id))
    .map((edge) => edge.id);

  return { exists: true, version: node.version, connectedBy };
}

async function currentEdgeState(db: Db, orgId: string, canvasId: string, edgeId: string): Promise<CurrentEdgeState> {
  const edges = await listConnections(db, { orgId, canvasId });
  return { exists: edges.some((edge) => edge.id === edgeId) };
}

async function applyWrite(db: Db, orgId: string, canvasId: string, write: InverseWrite, actor: Actor): Promise<void> {
  switch (write.op) {
    case 'delete_node':
      await deleteNode(db, { orgId, nodeId: write.nodeId, actor });
      return;
    case 'restore_node': {
      const data = write.data as {
        position?: { x: number; y: number; z: number };
        size?: { width: number | null; height: number | null };
        data?: Record<string, unknown>;
      };
      await restoreNode(db, {
        orgId,
        nodeId: write.nodeId,
        position: data.position ?? { x: 0, y: 0, z: 0 },
        size: data.size ?? { width: null, height: null },
        data: data.data ?? {},
        actor
      });
      return;
    }
    case 'write_node_data': {
      const patch = write.data as { data?: Record<string, unknown> };
      await writeNodeData(db, {
        orgId,
        nodeId: write.nodeId,
        data: patch.data ?? {},
        expectedVersion: write.expectedVersion,
        actor
      });
      return;
    }
    case 'delete_edge':
      await deleteConnection(db, { orgId, connectionId: write.edgeId, actor });
      return;
    case 'restore_edge':
      await restoreConnection(db, { orgId, connectionId: write.edgeId, actor });
      return;
  }
}

export async function undoGesture(
  db: Db,
  input: { orgId: string; canvasId: string; gesture: Gesture; actor: Actor }
): Promise<UndoOutcome> {
  const ownEdgeIds = new Set(
    input.gesture.items.filter((item) => item.kind === 'edge.create' || item.kind === 'edge.delete').map((item) => item.edgeId)
  );

  const currentOf = new Map<UndoItem, { node?: CurrentNodeState; edge?: CurrentEdgeState }>();
  for (const item of input.gesture.items) {
    if (item.kind === 'edge.create' || item.kind === 'edge.delete') {
      currentOf.set(item, { edge: await currentEdgeState(db, input.orgId, input.canvasId, item.edgeId) });
      continue;
    }
    currentOf.set(item, { node: await currentNodeState(db, input.orgId, item.nodeId, ownEdgeIds) });
  }

  const check = checkGesture(input.gesture, (item) => currentOf.get(item) ?? {});
  if (check.outcome === 'stale') {
    return { outcome: 'refused', reason: check.reason };
  }

  for (const write of check.writes) {
    await applyWrite(db, input.orgId, input.canvasId, write, input.actor);
  }

  return { outcome: 'undone' };
}
