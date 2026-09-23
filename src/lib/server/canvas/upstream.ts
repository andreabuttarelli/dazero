import type { Db } from '$lib/server/db/client';
import { listConnections, listNodes, type CanvasNodeRecord, type Connection } from '$lib/server/repos/canvas';
import { findAsset } from '$lib/server/repos/assets';
import { listInfluencerViews, signInfluencerViewFiles } from '$lib/server/repos/influencers';
import {
  resolveUpstreamInputs,
  type UpstreamEdge,
  type UpstreamInputs,
  type UpstreamNode
} from '$lib/canvas/upstream-inputs';
import type { Modalities } from '$lib/canvas/connectors';

/**
 * DAL DATABASE ALLA FORMA PURA CHE `upstream-inputs.ts` LEGGE.
 *
 * `resolveUpstreamInputs` non sa cosa sia un `Db`: prende nodi, archi e le modalità del modello
 * scelto già risolte. Questo file è l'unico punto che parla al database per farglieli — legge la
 * tela una volta, poi chiede lo stesso testo da monte a ogni giro. `generate.ts` chiama SOLO
 * questa funzione: la forma della query resta qui, non in mezzo alla logica che genera.
 *
 * IL TESTO SORGENTE È `data.refId` → `assets.content` per un nodo che genera, `data.content` per
 * un `doc`: la stessa coppia che `canvas-node-data.ts::genOf`/`docOf` legge lato client, perché
 * client e server devono vedere lo stesso nodo nello stesso modo.
 *
 * UN MODELLO SPARITO DA `ai_models` BLOCCA IL NODO, PRIMA di risolvere qualunque cosa — non un
 * arco alla volta, il nodo intero: `modalitiesOf` che torna `null` qui non è "non ancora
 * sincronizzato" (quel caso non può più accadere — il selettore offre solo modelli con una riga
 * sincronizzata, decisione di prodotto), è un modello che C'ERA e ora `ai_models` non conferma
 * più. Chiedere al provider lo scoprirebbe comunque, dopo aver speso la latenza e forse il costo
 * della chiamata: qui si rifiuta PRIMA, con la stessa ragione che l'alert nel nodo può mostrare.
 * Il prompt, gli archi e il risultato precedente del nodo non li tocca nessuno — `blocked` ferma
 * solo la PROSSIMA generazione, la stessa disciplina che tiene `giveUp()` in `generate.ts` lontano
 * dal cancellare un `refId` prima di sapere l'esito.
 *
 * `model` QUI È IL NOSTRO ID INTERNO (`gpt-image-2.5-flare`), non l'id sul filo di OpenRouter
 * (`openai/gpt-image-2.5-flare`): `modalitiesOf` con un `catalogue` lo traduce da sé
 * (`wireModelId`, in `ai-models-sync.ts`) — lo stesso spec che `offerable-models.ts` legge per
 * decidere cosa offrire, non una seconda copia della stessa tabella.
 */
async function modalitiesFor(model: string, medium: 'image' | 'video'): Promise<Modalities | null> {
  const { modalitiesOf } = await import('$lib/server/ai-models-sync');
  const { createAdminClient } = await import('$lib/server/supabase-admin');
  const modalities = await modalitiesOf(createAdminClient(), model, medium);
  return modalities ? { input: modalities.input } : null;
}

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

/**
 * LE VISTE DI UN NODO `influencer`, GIÀ NELL'ORDINE GIUSTO — `listInfluencerViews` ordina per
 * `sort_order`, questo file non riordina niente: `resolveUpstreamInputs` consuma `mediaUrls`
 * com'è, come il suo stesso commento dichiara. Un influencer senza `influencer_id` valido (una
 * riga malformata, mai dovrebbe accadere dopo `validateNodeData`) torna un elenco vuoto — lo
 * stesso "niente da dare" di un nodo mai girato, non un errore che ferma la tela.
 */
async function influencerMediaUrls(db: Db, node: CanvasNodeRecord): Promise<string[]> {
  const influencerId = typeof node.data.influencer_id === 'string' ? node.data.influencer_id : null;
  if (!influencerId) return [];

  const views = await listInfluencerViews(db, influencerId);
  if (!views.length) return [];

  const signed = await signInfluencerViewFiles(db, views.map((v) => v.storagePath));
  return views.map((v) => signed.get(v.storagePath)).filter((url): url is string => Boolean(url));
}

async function toUpstreamNode(db: Db, orgId: string, node: CanvasNodeRecord): Promise<UpstreamNode> {
  if (node.type === 'influencer') {
    return {
      id: node.id,
      type: node.type,
      model: null,
      text: null,
      mediaUrl: null,
      mediaUrls: await influencerMediaUrls(db, node)
    };
  }

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

const BLOCKED_EMPTY: Omit<UpstreamInputs, 'blocked'> = {
  text: [],
  referenceImageUrl: null,
  referenceImageUrls: [],
  referenceVideoUrls: [],
  referenceAudioUrls: [],
  startFrameUrl: null,
  endFrameUrl: null,
  rejected: []
};

/**
 * QUEL CHE `nodeId` RICEVE DA CHI GLI È COLLEGATO SU QUESTA TELA, ADESSO. Una lettura di `nodes`
 * e `nodes_connections`, poi l'asset di ogni sorgente che ne ha uno: N+1 sugli asset, accettabile
 * perché una tela ha decine di nodi, non migliaia, e la generazione stessa costa molto di più di
 * questa lettura.
 */
export async function upstreamInputsFor(
  db: Db,
  scope: { orgId: string; canvasId: string; nodeId: string; model?: string | null; medium?: 'text' | 'image' | 'video' }
): Promise<UpstreamInputs> {
  const checkable = scope.model && (scope.medium === 'image' || scope.medium === 'video');
  const modalities = checkable ? await modalitiesFor(scope.model!, scope.medium as 'image' | 'video') : null;

  if (checkable && !modalities) {
    return {
      ...BLOCKED_EMPTY,
      blocked: `${scope.model} non è più fra i modelli sincronizzati da OpenRouter — scegli un altro modello per continuare`
    };
  }

  const [nodeRows, connectionRows] = await Promise.all([
    listNodes(db, { orgId: scope.orgId, canvasId: scope.canvasId }),
    listConnections(db, { orgId: scope.orgId, canvasId: scope.canvasId })
  ]);

  const nodes = await Promise.all(nodeRows.map((n) => toUpstreamNode(db, scope.orgId, n)));
  const edges = connectionRows.map(toUpstreamEdge);

  return resolveUpstreamInputs(nodes, edges, scope.nodeId, modalities ?? { input: [] });
}
