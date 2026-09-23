import type { Db } from '$lib/server/db/client';
import type { Actor } from '$lib/server/repos/actor';
import { createConnection, createNode, listConnections, listNodes, type CanvasNodeRecord, type Connection } from '$lib/server/repos/canvas';
import { planDuplicate, DUPLICATE_OFFSET } from '$lib/canvas/duplicate-plan';

/**
 * DUPLICARE UNA SELEZIONE: N nodi nuovi, e le linee che stavano interamente dentro di lei.
 *
 * IL PIANO STA IN `duplicate-plan.ts`, PURO — questo file lo esegue. `planDuplicate` non conosce
 * il database: dice quali copie nascono e quali linee le uniscono, per INDICE nell'elenco scelto.
 * Qui gli indici diventano id veri, uno alla volta — `createNode` è l'unico modo che il repository
 * offre per farne nascere uno, e non esiste un `insert` a righe multiple che gli somigli: N
 * scritture in sequenza, non una sola atomica, la stessa scelta che l'azione `remove` fa già per
 * cancellare più righe.
 *
 * SOLO LE TILE CHE ESISTONO DAVVERO ENTRANO NEL PIANO: un id scelto che la tela non ha più (un
 * collega l'ha cancellato un attimo prima) si scarta qui, senza far fallire il resto della
 * selezione — duplicare nove tile su dieci è meglio di un rifiuto secco perché la decima è sparita.
 */
export async function duplicateNodes(
  db: Db,
  input: { orgId: string; projectId: string; canvasId: string; nodeIds: string[]; actor?: Actor }
): Promise<{ nodes: CanvasNodeRecord[]; connections: Connection[] }> {
  if (!input.nodeIds.length) {
    return { nodes: [], connections: [] };
  }

  const [existingNodes, existingEdges] = await Promise.all([
    listNodes(db, { orgId: input.orgId, canvasId: input.canvasId }),
    listConnections(db, { orgId: input.orgId, canvasId: input.canvasId })
  ]);

  const chosenIds = existingNodes.filter((n) => input.nodeIds.includes(n.id)).map((n) => n.id);

  const plan = planDuplicate({
    ids: chosenIds,
    nodes: existingNodes.map((n) => ({ id: n.id, type: n.type, data: n.data, x: n.position.x, y: n.position.y })),
    edges: existingEdges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    })),
    offset: DUPLICATE_OFFSET
  });

  const nodes: CanvasNodeRecord[] = [];
  for (const planned of plan.nodes) {
    const node = await createNode(db, {
      orgId: input.orgId,
      projectId: input.projectId,
      canvasId: input.canvasId,
      type: planned.type,
      x: planned.x,
      y: planned.y,
      data: planned.data,
      actor: input.actor
    });
    nodes.push(node);
  }

  const connections: Connection[] = [];
  for (const planned of plan.edges) {
    const connection = await createConnection(db, {
      orgId: input.orgId,
      canvasId: input.canvasId,
      sourceNodeId: nodes[planned.sourceIndex].id,
      targetNodeId: nodes[planned.targetIndex].id,
      sourceHandle: planned.sourceHandle,
      targetHandle: planned.targetHandle,
      actor: input.actor
    });
    connections.push(connection);
  }

  return { nodes, connections };
}
