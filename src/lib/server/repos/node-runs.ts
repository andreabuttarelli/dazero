import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';

/**
 * I GIRI DI UN NODO CHE PRODUCE: uno per generazione, tutti, con quello che è costato.
 *
 * La riga è un fatto avvenuto — `prompt` e `model` si COPIANO sul giro, non si rileggono dal
 * nodo, che cambia mentre si guarda il risultato di ieri. Ed è qui che sta il prezzo: un costo
 * scritto su `nodes.data` verrebbe sovrascritto a ogni rigenerazione, e il costo è il dato che
 * dice se il prodotto sta guadagnando.
 *
 * IL CLAIM È ATOMICO e va fatto PRIMA di ogni operazione non idempotente. Due tick sovrapposti
 * che finalizzano la stessa run addebitano due volte: soldi veri, non un difetto estetico.
 * `attempts` NON si incrementa sul claim — la maggior parte dei claim sono un «è pronta?» su un
 * render sanissimo, e contarli trasforma il tetto dei tentativi in una scadenza di N minuti.
 */
type RunRow = Database['public']['Tables']['node_runs']['Row'];

export type NodeRunStatus = 'running' | 'finishing' | 'done' | 'failed' | 'expired';

export type NodeRun = {
  id: string;
  orgId: string;
  nodeId: string;
  prompt: string | null;
  model: string | null;
  params: Record<string, unknown>;
  status: NodeRunStatus;
  error: string | null;
  outputAssetId: string | null;
  externalJobId: string | null;
  costUsd: number | null;
  attempts: number;
  /** Chi paga e autorizza il giro — su un video in coda è lo userId che serve a ritirare la clip. */
  actorId: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const RUN_COLUMNS =
  'id, org_id, node_id, prompt, model, params, status, error, output_asset_id, external_job_id, cost_usd, attempts, actor_id, started_at, finished_at';

type RunColumns = Pick<
  RunRow,
  | 'id'
  | 'org_id'
  | 'node_id'
  | 'prompt'
  | 'model'
  | 'params'
  | 'status'
  | 'error'
  | 'output_asset_id'
  | 'external_job_id'
  | 'cost_usd'
  | 'attempts'
  | 'actor_id'
  | 'started_at'
  | 'finished_at'
>;

function toRun(row: RunColumns): NodeRun {
  return {
    id: row.id,
    orgId: row.org_id,
    nodeId: row.node_id,
    prompt: row.prompt,
    model: row.model,
    params: (row.params ?? {}) as Record<string, unknown>,
    status: row.status as NodeRunStatus,
    error: row.error,
    outputAssetId: row.output_asset_id,
    externalJobId: row.external_job_id,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    attempts: Number(row.attempts ?? 0),
    actorId: row.actor_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

export async function createRun(
  db: Db,
  input: {
    orgId: string;
    nodeId: string;
    prompt: string;
    model: string | null;
    params: Record<string, unknown>;
    actorKind: string;
    actorId: string | null;
    externalJobId?: string | null;
  }
): Promise<NodeRun> {
  const { data, error } = await db
    .from('node_runs')
    .insert({
      org_id: input.orgId,
      node_id: input.nodeId,
      prompt: input.prompt,
      model: input.model,
      params: input.params,
      status: 'running',
      external_job_id: input.externalJobId ?? null,
      actor_kind: input.actorKind,
      actor_id: input.actorId
    })
    .select(RUN_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toRun(data);
}

/**
 * Prende un giro da finalizzare, o null se qualcun altro l'ha già preso.
 *
 * `status = 'running'` nel WHERE è il lock: zero righe non è un successo, è un altro worker che
 * ci è arrivato prima. Senza, due tick sovrapposti finalizzano due volte e pagano due volte.
 */
export async function claimRun(
  db: Db,
  input: { orgId: string; runId: string }
): Promise<NodeRun | null> {
  const { data, error } = await db
    .from('node_runs')
    .update({ status: 'finishing', claimed_at: new Date().toISOString() })
    .eq('id', input.runId)
    .eq('org_id', input.orgId)
    .eq('status', 'running')
    .select(RUN_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toRun(data) : null;
}

/**
 * Rende il giro a `running`, com'era prima del claim. Per un "è pronta?" che dice ancora no: il
 * fornitore va richiesto al prossimo tick, senza contarlo come un tentativo fallito.
 */
export async function releaseClaim(
  db: Db,
  input: { orgId: string; runId: string }
): Promise<void> {
  const { error } = await db
    .from('node_runs')
    .update({ status: 'running', claimed_at: null })
    .eq('id', input.runId)
    .eq('org_id', input.orgId)
    .eq('status', 'finishing');

  if (error) {
    throw error;
  }
}

/**
 * Rende il giro a `running` e conta il tentativo. Per un errore incerto — non il rifiuto letto dal
 * fornitore, ma una riga che non si è lasciata scrivere — dove ririprovare ha senso ma non
 * all'infinito: il chiamante confronta `attempts` col proprio tetto prima del prossimo tick.
 */
export async function retryClaim(
  db: Db,
  input: { orgId: string; runId: string; attempts: number; error: string }
): Promise<void> {
  const { error } = await db
    .from('node_runs')
    .update({ status: 'running', claimed_at: null, attempts: input.attempts, error: input.error })
    .eq('id', input.runId)
    .eq('org_id', input.orgId)
    .eq('status', 'finishing');

  if (error) {
    throw error;
  }
}

/**
 * I giri video in coda: `running` con un `external_job_id` già scritto. Un giro sincrono (testo,
 * immagine) non ha mai un external_job_id — lo abbandona subito a `done` o `failed` — quindi il
 * filtro basta a distinguere i due mondi senza un `medium` sulla riga.
 */
export async function queuedVideoRuns(db: Db, input: { limit: number }): Promise<NodeRun[]> {
  const { data, error } = await db
    .from('node_runs')
    .select(RUN_COLUMNS)
    .eq('status', 'running')
    .not('external_job_id', 'is', null)
    .order('started_at', { ascending: true })
    .limit(input.limit);

  if (error) {
    throw error;
  }
  return (data ?? []).map(toRun);
}

export async function completeRun(
  db: Db,
  input: { orgId: string; runId: string; assetId: string; costUsd?: number | null }
): Promise<void> {
  const { error } = await db
    .from('node_runs')
    .update({
      status: 'done',
      output_asset_id: input.assetId,
      cost_usd: input.costUsd ?? null,
      finished_at: new Date().toISOString()
    })
    .eq('id', input.runId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

export async function failRun(
  db: Db,
  input: { orgId: string; runId: string; error: string }
): Promise<void> {
  const { error } = await db
    .from('node_runs')
    .update({
      status: 'failed',
      error: input.error,
      finished_at: new Date().toISOString()
    })
    .eq('id', input.runId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

/**
 * Un giro che non ha fallito — nessuno ha mai detto di no — ma nemmeno è più tornato. `failed` e
 * `expired` restano due fatti diversi: il primo è il fornitore che ha risposto, il secondo è che
 * ha smesso di rispondere, o la richiesta che lo teneva in piedi è morta a metà.
 */
export async function expireRun(
  db: Db,
  input: { orgId: string; runId: string; error: string }
): Promise<void> {
  const { error } = await db
    .from('node_runs')
    .update({
      status: 'expired',
      error: input.error,
      finished_at: new Date().toISOString()
    })
    .eq('id', input.runId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

export async function setExternalJob(
  db: Db,
  input: { orgId: string; runId: string; externalJobId: string }
): Promise<void> {
  const { error } = await db
    .from('node_runs')
    .update({ external_job_id: input.externalJobId })
    .eq('id', input.runId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}

export async function listNodeRuns(
  db: Db,
  scope: { orgId: string; nodeId: string }
): Promise<NodeRun[]> {
  const { data, error } = await db
    .from('node_runs')
    .select(RUN_COLUMNS)
    .eq('org_id', scope.orgId)
    .eq('node_id', scope.nodeId)
    .order('started_at', { ascending: true });

  if (error) {
    throw error;
  }
  return (data ?? []).map(toRun);
}

/**
 * OGNI RUN ANCORA `running`, la più vecchia prima — quello che un tick da drenare legge PRIMA di
 * filtrare per quello che gli interessa (`loop.ts` cerca `params.loop.phase === 'queued'` fra
 * queste; `expireStuckRuns` guarda l'età). Nessun filtro jsonb qui: nessuna query in questo repo
 * lo fa ancora, e la tela non ha migliaia di run — filtrare in JS dopo una `select` larga resta
 * la stessa disciplina di `dueRuns`, che fa esattamente questo per l'età.
 */
export async function runningRuns(db: Db, input: { limit: number }): Promise<NodeRun[]> {
  const { data, error } = await db
    .from('node_runs')
    .select(RUN_COLUMNS)
    .eq('status', 'running')
    .order('started_at', { ascending: true })
    .limit(input.limit);

  if (error) {
    throw error;
  }
  return (data ?? []).map(toRun);
}

export async function dueRuns(db: Db, input: { before: string }): Promise<NodeRun[]> {
  const { data, error } = await db
    .from('node_runs')
    .select(RUN_COLUMNS)
    .eq('status', 'running')
    .lt('started_at', input.before);

  if (error) {
    throw error;
  }
  return (data ?? []).map(toRun);
}
