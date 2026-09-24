import type { Db } from '$lib/server/db/client';
import { listConnections, listNodes, type CanvasNodeRecord, type Connection } from '$lib/server/repos/canvas';
import { findAsset, findAssets } from '$lib/server/repos/assets';
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
 * IL TESTO SORGENTE È `data.refId` → `assets.content` per un nodo che genera, con `data.prompt`
 * come riserva quando non ha ancora girato — un testo mai generato dà comunque quel che c'è
 * scritto, invece di sparire dal giro a valle. Per un `doc` è `data.content`: la stessa coppia che
 * `canvas-node-data.ts::genOf`/`docOf` legge lato client, perché client e server devono vedere lo
 * stesso nodo nello stesso modo.
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
  if (asset?.content) {
    return asset.content;
  }
  const prompt = node.data.prompt;
  return typeof prompt === 'string' && prompt.trim() ? prompt : null;
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

/** Un item di `list.data.items`, con la stessa riserva per campo di ogni lettura da un jsonb. */
type ListItem = { label?: string; asset_id?: string; text?: string; url?: string };

function listItemsOf(node: CanvasNodeRecord): { itemKind: string; items: ListItem[] } {
  const itemKind = typeof node.data.item_kind === 'string' ? node.data.item_kind : 'image';
  const items = Array.isArray(node.data.items) ? (node.data.items as ListItem[]) : [];
  return { itemKind, items };
}

/**
 * OGNI `asset_id` DI UNA LISTA, RISOLTO IN UN GIRO SOLO — `findAssets` invece di un `findAsset`
 * per item: una lista di 50 modelli non fa 50 letture separate. Gli item con `url` già pronto
 * (trascinati da fuori l'asset library, o incollati) non entrano nel giro: non hanno bisogno di
 * una riga da leggere.
 */
async function itemMediaUrl(item: ListItem, assetsById: Map<string, { url: string | null }>): Promise<string | null> {
  if (item.url) return item.url;
  if (!item.asset_id) return null;
  return assetsById.get(item.asset_id)?.url ?? null;
}

async function resolveItemAssets(db: Db, orgId: string, items: ListItem[]) {
  const ids = items.map((item) => item.asset_id).filter((id): id is string => Boolean(id));
  return findAssets(db, { orgId, assetIds: ids });
}

/**
 * OGNI ITEM DI `list`, RISOLTO — TUTTI, per un filo `fixed` (la stessa dottrina di
 * `influencerMediaUrls`: un `list` collegato senza `iterate` alimenta con OGNI valore, non uno
 * a caso). L'esecutore del loop (`loop.ts`, non ancora scritto qui) legge `data.items` da sé per
 * un filo `iterate` — una combinazione per iterazione, non tutte insieme.
 */
async function listMediaUrls(db: Db, orgId: string, node: CanvasNodeRecord): Promise<string[]> {
  const { items } = listItemsOf(node);
  const assetsById = await resolveItemAssets(db, orgId, items);
  const urls = await Promise.all(items.map((item) => itemMediaUrl(item, assetsById)));
  return urls.filter((url): url is string => Boolean(url));
}

function listTexts(node: CanvasNodeRecord): string[] {
  const { items } = listItemsOf(node);
  return items.map((item) => item.text).filter((t): t is string => Boolean(t?.trim()));
}

/**
 * IL NODO `list` CHE ALIMENTA QUESTO `select`, O NULL QUANDO LA REFERENZA È ROTTA — cancellato,
 * mai stato collegato, o collegato a qualcosa che non è una lista. `select` prende SOLO dal primo
 * arco entrante che porta a un `list`: la stessa disciplina deterministica di
 * `upstream-inputs.ts::incomingEdges`, applicata qui perché un `select` ha senso con un solo
 * upstream — sceglierne uno fra due liste diverse non è un caso che il prodotto definisce.
 */
function listFeeding(node: CanvasNodeRecord, connections: Connection[], nodesById: Map<string, CanvasNodeRecord>): CanvasNodeRecord | null {
  const incoming = connections
    .filter((c) => c.targetNodeId === node.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const edge of incoming) {
    const source = nodesById.get(edge.sourceNodeId);
    if (source?.type === 'list') return source;
  }
  return null;
}

/**
 * L'ITEM DI UNA LISTA ALL'INDICE DATO (1-based), risolto a testo o url — la stessa domanda che
 * `select` fa sulla propria lista a monte, e che un'iterazione di loop fa su un asse `iterate`
 * (`iterateSelection`, sotto): un indice fuori range o una lista vuota tornano "niente da dare",
 * mai un valore a caso.
 */
async function itemAt(
  db: Db,
  orgId: string,
  list: CanvasNodeRecord,
  index: number
): Promise<{ text: string | null; mediaUrl: string | null }> {
  const { itemKind, items } = listItemsOf(list);
  const item = index >= 1 && index <= items.length ? items[index - 1] : null;
  if (!item) return { text: null, mediaUrl: null };

  if (itemKind === 'text') {
    return { text: item.text?.trim() ? item.text : null, mediaUrl: null };
  }
  const assetsById = await resolveItemAssets(db, orgId, [item]);
  return { text: null, mediaUrl: await itemMediaUrl(item, assetsById) };
}

/**
 * IL VALORE CHE `select` PORTA A VALLE: l'item ALL'INDICE SCELTO (1-based, come `data.index`)
 * della lista a monte — MAI la lista intera. Fuori range, lista vuota o nessuna lista collegata
 * tornano tutti "niente da dare": lo stesso `text: null, mediaUrl: null` di un nodo mai girato, e
 * `resolveUpstreamInputs` lo rifiuta con lo stesso messaggio — mai un valore scelto a caso al
 * posto di uno mancante.
 */
async function selectValue(
  db: Db,
  orgId: string,
  node: CanvasNodeRecord,
  connections: Connection[],
  nodesById: Map<string, CanvasNodeRecord>
): Promise<{ text: string | null; mediaUrl: string | null }> {
  const list = listFeeding(node, connections, nodesById);
  if (!list) return { text: null, mediaUrl: null };

  const index = typeof node.data.index === 'number' ? node.data.index : 0;
  return itemAt(db, orgId, list, index);
}

async function toUpstreamNode(
  db: Db,
  orgId: string,
  node: CanvasNodeRecord,
  connections: Connection[],
  nodesById: Map<string, CanvasNodeRecord>,
  iterateSelection: Record<string, number> = {}
): Promise<UpstreamNode> {
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

  if (node.type === 'list') {
    const { itemKind } = listItemsOf(node);

    // UN'ITERAZIONE DI LOOP VEDE UN ITEM SOLO — quando questo nodo è nella mappa, si risolve come
    // farebbe un `select` su se stesso a quell'indice, non con l'intera lista (il comportamento
    // `fixed`, invariato quando la mappa non lo nomina). Il resolver puro non lo sa: per lui è un
    // nodo con `text`/`mediaUrl` singoli, esattamente come qualunque altro nodo sorgente.
    if (node.id in iterateSelection) {
      const value = await itemAt(db, orgId, node, iterateSelection[node.id]);
      return { id: node.id, type: node.type, medium: itemKind === 'text' ? 'text' : 'image', model: null, text: value.text, mediaUrl: value.mediaUrl };
    }

    if (itemKind === 'text') {
      const texts = listTexts(node);
      return { id: node.id, type: node.type, medium: 'text', model: null, text: texts.join('\n\n') || null, mediaUrl: null };
    }
    return { id: node.id, type: node.type, medium: 'image', model: null, text: null, mediaUrl: null, mediaUrls: await listMediaUrls(db, orgId, node) };
  }

  if (node.type === 'select') {
    const list = listFeeding(node, connections, nodesById);
    const medium: 'text' | 'image' = list ? (listItemsOf(list).itemKind === 'text' ? 'text' : 'image') : 'image';
    const value = await selectValue(db, orgId, node, connections, nodesById);
    return { id: node.id, type: node.type, medium, model: null, text: value.text, mediaUrl: value.mediaUrl };
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
  scope: {
    orgId: string;
    canvasId: string;
    nodeId: string;
    model?: string | null;
    medium?: 'text' | 'image' | 'video';
    /** Un'iterazione di loop (`loop.ts`): quale item (1-based) di ogni `list` nominata qui vede
     *  QUESTA chiamata, invece della lista intera. Assente = comportamento `fixed`, invariato. */
    iterateSelection?: Record<string, number>;
  }
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

  const nodesById = new Map(nodeRows.map((n) => [n.id, n]));
  const iterateSelection = scope.iterateSelection ?? {};
  const nodes = await Promise.all(
    nodeRows.map((n) => toUpstreamNode(db, scope.orgId, n, connectionRows, nodesById, iterateSelection))
  );
  const edges = connectionRows.map(toUpstreamEdge);

  return resolveUpstreamInputs(nodes, edges, scope.nodeId, modalities ?? { input: [] });
}
