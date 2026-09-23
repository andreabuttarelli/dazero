import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { NarrowedDatabase } from '$lib/server/db/typed-database';
import { actorCols, edgeActorCols, type Actor } from './actor';
import { recordEvent } from './canvas-events';

/**
 * IL CANVAS: TELE, NODI, ARCHI.
 *
 * Due regole che il resto del file applica e non ripete:
 *
 *   OGNI QUERY PORTA `org_id`. Anche quando filtra su `canvas_id`, che sarebbe già univoco: la
 *   service role non ha RLS, e un id che arriva dall'URL è di chiunque finché non lo si lega a
 *   un'org. `tenancy.test.ts` legge questo file e cade se una query lo dimentica.
 *
 *   LA POSIZIONE E IL CONTENUTO NON SI SCRIVONO ALLO STESSO MODO. Trascinare è last-write-wins —
 *   due mani sullo stesso nodo si contendono il mouse e nessuno perde lavoro. Il contenuto no: se
 *   A riscrive il prompt e B cambia il modello, l'ultimo che arriva butta via l'altro senza dirlo.
 *   Per questo `data` passa dalla versione attesa e zero righe è un conflitto, non un successo.
 *
 *   OGNI GESTO STRUTTURALE SCRIVE `canvas_events` — create/update/delete di un nodo, create/delete
 *   di un arco, MAI `moveNode`/`resizeNode` (la posizione vive già su `nodes.x/y/z`, e un evento
 *   per fotogramma sarebbe il 90% delle righe e la meno interessante da rileggere). Questo file lo
 *   fa da sé, non i chiamanti: `before` deve essere popolato SEMPRE, anche quando chi chiama non
 *   passa un `actor` e quindi non potrà mai riguardarlo — è il registro che permette di recuperare
 *   un nodo cancellato per sbaglio, non il meccanismo di undo (quello sta nello stack del client,
 *   `$lib/canvas/undo-plan.ts`). Se la scrittura sul database fallisce non si scrive l'evento; se
 *   `recordEvent` fallisce dopo una scrittura riuscita, l'errore sale lo stesso — un evento perso
 *   è un buco nell'audit trail, mai un motivo per far credere a chi chiama che la scrittura vera
 *   non sia andata a buon fine.
 */
type NodeInsert = NarrowedDatabase['public']['Tables']['nodes']['Insert'];
type NodeUpdate = NarrowedDatabase['public']['Tables']['nodes']['Update'];

type NodeColumns = Pick<
  NarrowedDatabase['public']['Tables']['nodes']['Row'],
  | 'id'
  | 'canvas_id'
  | 'project_id'
  | 'type'
  | 'display_name'
  | 'x'
  | 'y'
  | 'z'
  | 'width'
  | 'height'
  | 'data'
  | 'version'
>;

type ConnectionColumns = Pick<
  Database['public']['Tables']['nodes_connections']['Row'],
  'id' | 'canvas_id' | 'source_node_id' | 'target_node_id' | 'source_handle' | 'target_handle' | 'mode'
>;

/** Gli stessi due valori di `nodes_connections_mode_check`. */
export const WIRE_MODES = ['fixed', 'iterate'] as const;
export type WireMode = (typeof WIRE_MODES)[number];

export function isWireMode(x: string): x is WireMode {
  return (WIRE_MODES as readonly string[]).includes(x);
}

type CanvasColumns = Pick<
  Database['public']['Tables']['canvases']['Row'],
  'id' | 'project_id' | 'name' | 'viewport'
>;

export type Canvas = {
  id: string;
  projectId: string;
  name: string;
  viewport: { x: number; y: number; zoom: number } | null;
};

export type CanvasNodeRecord = {
  id: string;
  canvasId: string;
  projectId: string;
  type: string;
  displayName: string | null;
  position: { x: number; y: number; z: number };
  size: { width: number | null; height: number | null };
  data: Record<string, unknown>;
  version: number;
};

export type Connection = {
  id: string;
  canvasId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  /** Fisso (default) entra in OGNI iterazione di un loop a valle; `iterate` è un asse del
   *  prodotto cartesiano/zip che `loop-plan.ts` calcola (CLAUDE.md — loop mode). */
  mode: WireMode;
};

export type DataWrite =
  | { outcome: 'written'; node: CanvasNodeRecord }
  | { outcome: 'conflict' };

const NODE_COLUMNS =
  'id, canvas_id, project_id, type, display_name, x, y, z, width, height, data, version';
const CONNECTION_COLUMNS =
  'id, canvas_id, source_node_id, target_node_id, source_handle, target_handle, mode';
const CANVAS_COLUMNS = 'id, project_id, name, viewport';

function toCanvas(row: CanvasColumns): Canvas {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    viewport: (row.viewport as Canvas['viewport']) ?? null
  };
}

function toNode(row: NodeColumns): CanvasNodeRecord {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    projectId: row.project_id,
    type: row.type,
    displayName: row.display_name,
    position: { x: Number(row.x), y: Number(row.y), z: Number(row.z) },
    size: {
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height)
    },
    data: (row.data ?? {}) as Record<string, unknown>,
    version: Number(row.version)
  };
}

function toConnection(row: ConnectionColumns): Connection {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
    mode: isWireMode(row.mode) ? row.mode : 'fixed'
  };
}

export async function listCanvases(
  db: Db,
  scope: { orgId: string; projectId: string }
): Promise<Canvas[]> {
  const { data, error } = await db
    .from('canvases')
    .select(CANVAS_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('project_id', scope.projectId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toCanvas);
}

export async function createCanvas(
  db: Db,
  input: { orgId: string; projectId: string; name: string }
): Promise<Canvas> {
  const { data, error } = await db
    .from('canvases')
    .insert({ org_id: input.orgId, project_id: input.projectId, name: input.name })
    .select(CANVAS_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toCanvas(data);
}

export async function saveViewport(
  db: Db,
  input: { orgId: string; canvasId: string; viewport: { x: number; y: number; zoom: number } }
): Promise<void> {
  const { error } = await db
    .from('canvases')
    .update({ viewport: input.viewport, updated_at: new Date().toISOString() })
    .eq('id', input.canvasId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

export async function listNodes(
  db: Db,
  scope: { orgId: string; canvasId: string }
): Promise<CanvasNodeRecord[]> {
  const { data, error } = await db
    .from('nodes')
    .select(NODE_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('canvas_id', scope.canvasId)
    .is('deleted_at', null)
    .order('z', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toNode);
}

/**
 * DA UN ELENCO DI ID DI NODO AI NODI, SENZA CANVAS: la libreria media guarda tutto il progetto,
 * non una tela sola, e `source_node_id` non porta con sé quale tela lo tiene.
 */
export async function listNodesByIds(
  db: Db,
  scope: { orgId: string; nodeIds: string[] }
): Promise<CanvasNodeRecord[]> {
  if (!scope.nodeIds.length) {
    return [];
  }

  const { data, error } = await db
    .from('nodes')
    .select(NODE_COLUMNS)
    .eq('org_id', scope.orgId)
    .in('id', scope.nodeIds)
    .is('deleted_at', null);

  if (error) {
    throw error;
  }
  return (data ?? []).map(toNode);
}

export async function findNode(
  db: Db,
  input: { orgId: string; nodeId: string }
): Promise<CanvasNodeRecord | null> {
  const { data, error } = await db
    .from('nodes')
    .select(NODE_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.nodeId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toNode(data) : null;
}

export async function createNode(
  db: Db,
  input: {
    orgId: string;
    projectId: string;
    canvasId: string;
    type: string;
    x: number;
    y: number;
    displayName?: string | null;
    data?: Record<string, unknown>;
    actor?: Actor;
  }
): Promise<CanvasNodeRecord> {
  /**
   * `type` e `data` arrivano qui SLEGATI — chi chiama non promette che siano la stessa coppia che
   * `node-data.ts` accetterebbe, e questo repo non li valida: quella riga sta in `write-tool.ts`
   * per l'MCP, non qui. Il cast dichiara l'onestà del confine, non una garanzia che non c'è.
   */
  const row: NodeInsert = {
    org_id: input.orgId,
    project_id: input.projectId,
    canvas_id: input.canvasId,
    type: input.type,
    display_name: input.displayName ?? null,
    x: input.x,
    y: input.y,
    data: input.data ?? {},
    ...actorCols(input.actor)
  } as NodeInsert;

  const { data, error } = await db.from('nodes').insert<NodeInsert>(row).select(NODE_COLUMNS).single();

  if (error) {
    throw error;
  }
  const node = toNode(data);

  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: input.canvasId,
    kind: 'node.create',
    nodeId: node.id,
    after: { type: node.type, position: node.position, data: node.data },
    actor: input.actor
  });

  return node;
}

/**
 * Trascinare: last-write-wins. La versione non entra né nel `WHERE` né nel `SET` — alzarla qui
 * farebbe fallire la scrittura del contenuto di chi sta scrivendo nel pannello mentre un altro
 * muove il nodo, che è esattamente il lavoro che la versione dovrebbe proteggere.
 */
export async function moveNode(
  db: Db,
  input: { orgId: string; nodeId: string; x: number; y: number; z?: number; actor?: Actor }
): Promise<CanvasNodeRecord | null> {
  const position = input.z === undefined ? { x: input.x, y: input.y } : { x: input.x, y: input.y, z: input.z };

  const { data, error } = await db
    .from('nodes')
    .update({ ...position, ...actorCols(input.actor), updated_at: new Date().toISOString() })
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId)
    .select(NODE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toNode(data) : null;
}

export async function resizeNode(
  db: Db,
  input: { orgId: string; nodeId: string; width: number; height: number }
): Promise<void> {
  const { error } = await db
    .from('nodes')
    .update({ width: input.width, height: input.height, updated_at: new Date().toISOString() })
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

/**
 * Il contenuto: concorrenza ottimistica. Zero righe non è "niente da fare" — è qualcun altro che
 * è arrivato prima, e chi chiama rilegge e riapplica invece di credere di aver scritto.
 *
 * `before` PER L'EVENTO VIENE DA UNA LETTURA A PARTE, prima dello `UPDATE`: la riga che
 * `RETURNING` restituisce è già quella NUOVA, e l'evento deve raccontare cosa c'era prima, non
 * cosa c'è adesso. Se nel frattempo la versione non torna più (conflitto), quella lettura non è
 * comunque sprecata: è la stessa domanda che il conflitto avrebbe comunque richiesto.
 */
export async function writeNodeData(
  db: Db,
  input: {
    orgId: string;
    nodeId: string;
    data: Record<string, unknown>;
    expectedVersion: number;
    actor?: Actor;
  }
): Promise<DataWrite> {
  const before = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });

  /** Stesso confine di `createNode`: `data` arriva senza `type` qui, quindi non può provare di
   *  essere la forma giusta — chi valida la coppia è `write-tool.ts`, non questo repo. */
  const patch: NodeUpdate = {
    data: input.data,
    version: input.expectedVersion + 1,
    ...actorCols(input.actor),
    updated_at: new Date().toISOString()
  } as NodeUpdate;

  const { data, error } = await db
    .from('nodes')
    .update(patch)
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId)
    .eq('version', input.expectedVersion)
    .select(NODE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return { outcome: 'conflict' };
  }
  const node = toNode(data);

  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: node.canvasId,
    kind: 'node.update',
    nodeId: node.id,
    before: { data: before?.data ?? null },
    after: { data: node.data },
    actor: input.actor
  });

  return { outcome: 'written', node };
}

/** Soft delete: l'arco verso un nodo non svanisce mentre qualcuno lo guarda, e l'undo ha cosa riportare. */
export async function deleteNode(
  db: Db,
  input: { orgId: string; nodeId: string; actor?: Actor }
): Promise<void> {
  const before = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!before) {
    return;
  }

  const { error } = await db
    .from('nodes')
    .update({ deleted_at: new Date().toISOString(), ...actorCols(input.actor) })
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }

  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: before.canvasId,
    kind: 'node.delete',
    nodeId: before.id,
    before: { type: before.type, position: before.position, size: before.size, data: before.data, version: before.version },
    actor: input.actor
  });
}

/**
 * L'INVERSA DI `deleteNode`: rimette in vita un nodo soft-deleted con lo stato che aveva prima —
 * per l'undo del client (`$lib/canvas/undo-plan.ts::inverseOf` → `restore_node`). `before` è
 * quello che `deleteNode` ha scritto su `canvas_events.before`: `type`, `position`, `size`,
 * `data`, `version`. `type` non si riscrive — non cambia mai per un nodo che esiste già — ma il
 * resto sì, perché un ripristino deve tornare esattamente dove il nodo era, non dove capita.
 */
export async function restoreNode(
  db: Db,
  input: {
    orgId: string;
    nodeId: string;
    position: { x: number; y: number; z: number };
    size: { width: number | null; height: number | null };
    data: Record<string, unknown>;
    actor?: Actor;
  }
): Promise<CanvasNodeRecord | null> {
  const patch: NodeUpdate = {
    deleted_at: null,
    x: input.position.x,
    y: input.position.y,
    z: input.position.z,
    width: input.size.width,
    height: input.size.height,
    data: input.data,
    ...actorCols(input.actor),
    updated_at: new Date().toISOString()
  } as NodeUpdate;

  const { data, error } = await db
    .from('nodes')
    .update(patch)
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId)
    .select(NODE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  const node = toNode(data);

  // Niente `node.restore` nel CHECK di `kind` (NEW_DATABASE_STRUCTURE.md §7): un ripristino è
  // scritto come `node.create` perché la forma di `after` è la stessa e la riga rinasce visibile
  // — un `kind` in più andrebbe aggiunto con una migrazione sua, non inventato di nascosto qui.
  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: node.canvasId,
    kind: 'node.create',
    nodeId: node.id,
    after: { type: node.type, position: node.position, data: node.data },
    actor: input.actor
  });

  return node;
}

export async function listConnections(
  db: Db,
  scope: { orgId: string; canvasId: string }
): Promise<Connection[]> {
  const { data, error } = await db
    .from('nodes_connections')
    .select(CONNECTION_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('canvas_id', scope.canvasId)
    .is('deleted_at', null);

  if (error) {
    throw error;
  }
  return (data ?? []).map(toConnection);
}

export async function createConnection(
  db: Db,
  input: {
    orgId: string;
    canvasId: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    mode?: WireMode;
    actor?: Actor;
  }
): Promise<Connection> {
  const { data, error } = await db
    .from('nodes_connections')
    .insert({
      org_id: input.orgId,
      canvas_id: input.canvasId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      source_handle: input.sourceHandle ?? null,
      target_handle: input.targetHandle ?? null,
      mode: input.mode ?? 'fixed',
      ...edgeActorCols(input.actor)
    })
    .select(CONNECTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  const connection = toConnection(data);

  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: input.canvasId,
    kind: 'edge.create',
    edgeId: connection.id,
    after: {
      sourceNodeId: connection.sourceNodeId,
      targetNodeId: connection.targetNodeId,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle
    },
    actor: input.actor
  });

  return connection;
}

/**
 * Soft delete, non hard: `nodes_connections.deleted_at` esiste per lo stesso motivo di
 * `nodes.deleted_at` — un arco cancellato per sbaglio, o annullato da chi lo ha tolto, deve poter
 * tornare. `listConnections` già filtra `deleted_at is null`; una riga soft-deleted resta
 * invisibile alla tela finché nessuno la ripristina.
 */
export async function deleteConnection(
  db: Db,
  input: { orgId: string; connectionId: string; actor?: Actor }
): Promise<void> {
  const { data: before, error: readError } = await db
    .from('nodes_connections')
    .select(CONNECTION_COLUMNS)
    .eq('id', input.connectionId)
    .eq('org_id', input.orgId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }
  if (!before) {
    return;
  }

  const { error } = await db
    .from('nodes_connections')
    .update({ deleted_at: new Date().toISOString(), ...edgeActorCols(input.actor) })
    .eq('id', input.connectionId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }

  const connection = toConnection(before);
  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: connection.canvasId,
    kind: 'edge.delete',
    edgeId: connection.id,
    before: {
      sourceNodeId: connection.sourceNodeId,
      targetNodeId: connection.targetNodeId,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle
    },
    actor: input.actor
  });
}

/**
 * FISSO O ITERATE: il toggle che rende un filo un asse del loop a valle (`loop-plan.ts`), non
 * una nuova connessione — l'arco resta lo stesso, cambia solo come un nodo che genera lo legge.
 * `null` quando l'arco non c'è (già cancellato, o mai stato di questa org): chi chiama tratta
 * quel caso come farebbe con un 404, non con un'eccezione.
 */
export async function setConnectionMode(
  db: Db,
  input: { orgId: string; connectionId: string; mode: WireMode }
): Promise<Connection | null> {
  const { data, error } = await db
    .from('nodes_connections')
    .update({ mode: input.mode })
    .eq('id', input.connectionId)
    .eq('org_id', input.orgId)
    .select(CONNECTION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toConnection(data) : null;
}

/**
 * L'INVERSA DI `deleteConnection`: rimette in vita un arco soft-deleted, per l'undo del client
 * (`$lib/canvas/undo-plan.ts::inverseOf` → `restore_edge`). Un `INSERT` nuovo darebbe un `id`
 * diverso — il gesto da annullare parlava di QUESTO arco, non di uno equivalente — quindi qui si
 * pulisce `deleted_at` sulla riga che c'è già.
 */
export async function restoreConnection(
  db: Db,
  input: { orgId: string; connectionId: string; actor?: Actor }
): Promise<Connection | null> {
  const { data, error } = await db
    .from('nodes_connections')
    .update({ deleted_at: null, ...edgeActorCols(input.actor) })
    .eq('id', input.connectionId)
    .eq('org_id', input.orgId)
    .select(CONNECTION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  const connection = toConnection(data);

  // Stesso ragionamento di restoreNode: niente `edge.restore` nel CHECK, `edge.create` racconta
  // lo stesso fatto — l'arco torna visibile.
  await recordEvent(db, {
    orgId: input.orgId,
    canvasId: connection.canvasId,
    kind: 'edge.create',
    edgeId: connection.id,
    after: {
      sourceNodeId: connection.sourceNodeId,
      targetNodeId: connection.targetNodeId,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle
    },
    actor: input.actor
  });

  return connection;
}
