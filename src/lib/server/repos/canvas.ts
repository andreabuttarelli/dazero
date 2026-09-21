import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';

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
 */
type Json = Database['public']['Tables']['nodes']['Row']['data'];

type NodeColumns = Pick<
  Database['public']['Tables']['nodes']['Row'],
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
  'id' | 'canvas_id' | 'source_node_id' | 'target_node_id' | 'source_handle' | 'target_handle'
>;

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
};

export type DataWrite =
  | { outcome: 'written'; node: CanvasNodeRecord }
  | { outcome: 'conflict' };

const NODE_COLUMNS =
  'id, canvas_id, project_id, type, display_name, x, y, z, width, height, data, version';
const CONNECTION_COLUMNS =
  'id, canvas_id, source_node_id, target_node_id, source_handle, target_handle';
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
    targetHandle: row.target_handle
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
  }
): Promise<CanvasNodeRecord> {
  const { data, error } = await db
    .from('nodes')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId,
      canvas_id: input.canvasId,
      type: input.type,
      display_name: input.displayName ?? null,
      x: input.x,
      y: input.y,
      data: (input.data ?? {}) as Json
    })
    .select(NODE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toNode(data);
}

/**
 * Trascinare: last-write-wins. La versione non entra né nel `WHERE` né nel `SET` — alzarla qui
 * farebbe fallire la scrittura del contenuto di chi sta scrivendo nel pannello mentre un altro
 * muove il nodo, che è esattamente il lavoro che la versione dovrebbe proteggere.
 */
export async function moveNode(
  db: Db,
  input: { orgId: string; nodeId: string; x: number; y: number; z?: number }
): Promise<CanvasNodeRecord | null> {
  const position = input.z === undefined ? { x: input.x, y: input.y } : { x: input.x, y: input.y, z: input.z };

  const { data, error } = await db
    .from('nodes')
    .update({ ...position, updated_at: new Date().toISOString() })
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
 */
export async function writeNodeData(
  db: Db,
  input: {
    orgId: string;
    nodeId: string;
    data: Record<string, unknown>;
    expectedVersion: number;
  }
): Promise<DataWrite> {
  const { data, error } = await db
    .from('nodes')
    .update({
      data: input.data as Json,
      version: input.expectedVersion + 1,
      updated_at: new Date().toISOString()
    })
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
  return { outcome: 'written', node: toNode(data) };
}

/** Soft delete: l'arco verso un nodo non svanisce mentre qualcuno lo guarda, e l'undo ha cosa riportare. */
export async function deleteNode(
  db: Db,
  input: { orgId: string; nodeId: string }
): Promise<void> {
  const { error } = await db
    .from('nodes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.nodeId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
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
      target_handle: input.targetHandle ?? null
    })
    .select(CONNECTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toConnection(data);
}

export async function deleteConnection(
  db: Db,
  input: { orgId: string; connectionId: string }
): Promise<void> {
  const { error } = await db
    .from('nodes_connections')
    .delete()
    .eq('id', input.connectionId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}
