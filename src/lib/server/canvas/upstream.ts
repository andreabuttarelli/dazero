import type { Db } from '$lib/server/db/client';
import { listConnections, listNodes, type CanvasNodeRecord, type Connection } from '$lib/server/repos/canvas';
import { findAsset } from '$lib/server/repos/assets';
import {
  resolveUpstreamInputs,
  type UpstreamEdge,
  type UpstreamInputs,
  type UpstreamNode
} from '$lib/canvas/upstream-inputs';

/**
 * DAL DATABASE ALLA FORMA PURA CHE `upstream-inputs.ts` LEGGE.
 *
 * `resolveUpstreamInputs` non sa cosa sia un `Db`: prende nodi ed archi già risolti. Questo file
 * è l'unico punto che parla al database per farglieli — legge la tela una volta, poi chiede allo
 * stesso testo da monte a ogni giro. `generate.ts` chiama SOLO questa funzione: la forma della
 * query resta qui, non in mezzo alla logica che genera.
 *
 * IL TESTO SORGENTE È `data.refId` → `assets.content` per un nodo che genera, `data.content` per
 * un `doc`: la stessa coppia che `canvas-node-data.ts::genOf`/`docOf` legge lato client, perché
 * client e server devono vedere lo stesso nodo nello stesso modo.
 */
function sourceText(node: CanvasNodeRecord, asset: { content: string | null } | null): string | null {
  if (node.type === 'doc') {
    const content = node.data.content;
    return typeof content === 'string' && content.trim() ? content : null;
  }
  return asset?.content ?? null;
}

function sourceMediaUrl(asset: { url: string | null } | null): string | null {
  return asset?.url ?? null;
}

async function toUpstreamNode(db: Db, orgId: string, node: CanvasNodeRecord): Promise<UpstreamNode> {
  const refId = typeof node.data.refId === 'string' ? node.data.refId : null;
  const asset = refId ? await findAsset(db, { orgId, assetId: refId }) : null;

  return {
    id: node.id,
    type: node.type,
    model: typeof node.data.model === 'string' ? node.data.model : null,
    text: sourceText(node, asset),
    mediaUrl: sourceMediaUrl(asset)
  };
}

function toUpstreamEdge(connection: Connection): UpstreamEdge {
  return {
    id: connection.id,
    sourceNodeId: connection.sourceNodeId,
    targetNodeId: connection.targetNodeId,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle
  };
}

/**
 * QUEL CHE `nodeId` RICEVE DA CHI GLI È COLLEGATO SU QUESTA TELA, ADESSO. Una lettura di `nodes`
 * e `nodes_connections`, poi l'asset di ogni sorgente che ne ha uno: N+1 sugli asset, accettabile
 * perché una tela ha decine di nodi, non migliaia, e la generazione stessa costa molto di più di
 * questa lettura.
 */
export async function upstreamInputsFor(
  db: Db,
  scope: { orgId: string; canvasId: string; nodeId: string }
): Promise<UpstreamInputs> {
  const [nodeRows, connectionRows] = await Promise.all([
    listNodes(db, { orgId: scope.orgId, canvasId: scope.canvasId }),
    listConnections(db, { orgId: scope.orgId, canvasId: scope.canvasId })
  ]);

  const nodes = await Promise.all(nodeRows.map((n) => toUpstreamNode(db, scope.orgId, n)));
  const edges = connectionRows.map(toUpstreamEdge);

  return resolveUpstreamInputs(nodes, edges, scope.nodeId);
}
