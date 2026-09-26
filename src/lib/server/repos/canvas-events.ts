import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { Actor } from './actor';

type Json = Database['public']['Tables']['canvas_events']['Row']['before'];

/**
 * IL REGISTRO STRUTTURALE DELLA TELA: `canvas_events`.
 *
 * NON È IL MECCANISMO DI UNDO — quello vive sul client, come lo stack di gesti di UNA scheda
 * (`$lib/canvas/undo-plan.ts`). Questa tabella è l'AUDIT TRAIL: "Marco ha spostato 3 nodi", e il
 * recupero di un nodo cancellato per sbaglio giorni dopo, quando nessuno stack in memoria di
 * nessun browser lo ricorda più.
 *
 * SCRIVE IL CODICE, NON UN TRIGGER — `actor_kind` è metà del valore della tabella, e un trigger
 * non distingue un gesto di una persona da una scrittura di un agente da una migrazione
 * (NEW_DATABASE_STRUCTURE.md §7, §12). Per questo `recordEvent` è chiamata a mano da
 * `repos/canvas.ts`, non generata da un `AFTER INSERT/UPDATE` su `nodes`/`nodes_connections`.
 *
 * SOLO I GESTI STRUTTURALI: create/update/delete di un nodo, create/delete di un arco. Mai
 * `node.move` — la posizione vive già su `nodes.x/y/z`, e un evento per fotogramma sarebbe il 90%
 * delle righe e la meno interessante da rileggere.
 *
 * `before` VIENE SCRITTO SEMPRE, per ogni attore, ANCHE QUANDO CHI CHIAMA NON PASSA UN `actor`:
 * non è per l'undo di chi l'ha fatto — quello sta nello stack del suo browser, non qui — è perché
 * senza non si recupera un nodo cancellato per errore da qualcun altro, il caso in cui questa
 * riga serve di più.
 */
export const CANVAS_EVENT_KINDS = [
  'node.create',
  'node.update',
  'node.delete',
  'edge.create',
  'edge.delete'
] as const;
export type CanvasEventKind = (typeof CANVAS_EVENT_KINDS)[number];

export type CanvasEvent = {
  id: number;
  orgId: string;
  canvasId: string;
  kind: CanvasEventKind;
  nodeId: string | null;
  edgeId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorKind: 'user' | 'agent' | 'system';
  actorId: string | null;
  agentKey: string | null;
  createdAt: string;
};

const EVENT_COLUMNS =
  'id, org_id, canvas_id, kind, node_id, edge_id, before, after, actor_kind, actor_id, agent_key, created_at';

type EventRow = {
  id: number;
  org_id: string;
  canvas_id: string;
  kind: string;
  node_id: string | null;
  edge_id: string | null;
  before: unknown;
  after: unknown;
  actor_kind: string;
  actor_id: string | null;
  agent_key: string | null;
  created_at: string;
};

function toEvent(row: EventRow): CanvasEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    canvasId: row.canvas_id,
    kind: row.kind as CanvasEventKind,
    nodeId: row.node_id,
    edgeId: row.edge_id,
    before: (row.before as Record<string, unknown> | null) ?? null,
    after: (row.after as Record<string, unknown> | null) ?? null,
    actorKind: row.actor_kind as CanvasEvent['actorKind'],
    actorId: row.actor_id,
    agentKey: row.agent_key,
    createdAt: row.created_at
  };
}

export type RecordEventInput = {
  orgId: string;
  canvasId: string;
  kind: CanvasEventKind;
  nodeId?: string | null;
  edgeId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor?: Actor;
};

const SYSTEM_ACTOR = { actor_kind: 'system' as const, actor_id: null, agent_key: null };

/** La stessa tripla di `actorCols` — assente = `system`, mai un `null` muto sul kind. */
function eventActorCols(actor: Actor | undefined): Record<string, unknown> {
  if (!actor) {
    return SYSTEM_ACTOR;
  }
  return { actor_kind: actor.kind, actor_id: actor.id, agent_key: actor.agentKey ?? null };
}

export async function recordEvent(db: Db, input: RecordEventInput): Promise<CanvasEvent> {
  const row = {
    org_id: input.orgId,
    canvas_id: input.canvasId,
    kind: input.kind,
    node_id: input.nodeId ?? null,
    edge_id: input.edgeId ?? null,
    before: (input.before ?? null) as Json,
    after: (input.after ?? null) as Json,
    ...eventActorCols(input.actor)
  };

  const { data, error } = await db.from('canvas_events').insert(row).select(EVENT_COLUMNS).single();

  if (error) {
    throw error;
  }
  return toEvent(data as EventRow);
}

/** L'attività recente di una tela, più recente prima — la fonte di un pannello "cosa è successo qui". */
export async function listCanvasEvents(
  db: Db,
  scope: { orgId: string; canvasId: string; limit?: number }
): Promise<CanvasEvent[]> {
  const { data, error } = await db
    .from('canvas_events')
    .select(EVENT_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('canvas_id', scope.canvasId)
    .order('id', { ascending: false })
    .limit(scope.limit ?? 200);

  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => toEvent(row as EventRow));
}
