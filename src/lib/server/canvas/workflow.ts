import type { Db } from '$lib/server/db/client';
import { DEFAULT_MODEL } from '$lib/canvas/default-models';
import { runGenNode, type StartRun } from '$lib/server/canvas/generate';
import { findNode, writeNodeData, listConnections, type CanvasNodeRecord } from '$lib/server/repos/canvas';
import { createRun, claimRun, completeRun, failRun, runningRuns, runsByIds, type NodeRun } from '$lib/server/repos/node-runs';
import { planWorkflow, stepReadiness, type WorkflowStep, type StepStatus, type WorkflowPlanResult } from '$lib/canvas/workflow-plan';
import type { Actor } from '$lib/server/repos/actor';
import type { GenMedium } from '$lib/canvas/gen-node';
import { IMAGE_CREDITS, TEXT_NODE_CREDITS, videoCredits } from '$lib/server/content-cost';
import { randomUUID } from 'node:crypto';

function stepCredits(medium: GenMedium, model: string | null): number {
  if (medium === 'image') return IMAGE_CREDITS;
  if (medium === 'video') return videoCredits(model ?? undefined);
  return TEXT_NODE_CREDITS;
}

/** Il preventivo dell'intero workflow: la somma del prezzo unitario di ciascun passo — mai un
 *  prezzo unico moltiplicato, ogni passo può essere un medium diverso (testo → immagine → video). */
export function estimateWorkflowCredits(steps: { medium: GenMedium; model: string | null }[]): number {
  return steps.reduce((total, step) => total + stepCredits(step.medium, step.model), 0);
}

type WorkflowTicket = {
  phase: 'queued';
  workflowId: string;
  dependsOn: string[];
  projectId: string;
  canvasId: string;
  userId: string;
};

function ticketOf(run: NodeRun): WorkflowTicket | null {
  const raw = run.params.workflow;
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<WorkflowTicket>;
  if (t.phase !== 'queued' || typeof t.workflowId !== 'string' || !Array.isArray(t.dependsOn)) return null;
  return t as WorkflowTicket;
}

export function isWorkflowTicket(run: NodeRun): boolean {
  return ticketOf(run) !== null;
}

async function setRunning(db: Db, input: { orgId: string; nodeId: string; running: boolean; actor?: Actor }): Promise<void> {
  const node = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!node) return;

  await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: input.nodeId,
    expectedVersion: node.version,
    actor: input.actor,
    data: { ...node.data, running: input.running }
  }).catch(() => {});
}

export type WorkflowEnqueueInput = {
  orgId: string;
  projectId: string;
  canvasId: string;
  nodeIds: string[];
  userId: string;
  actor?: Actor;
};

export type WorkflowEnqueueOutcome =
  | { kind: 'refused'; error: string }
  | { kind: 'enqueued'; workflowId: string; steps: WorkflowStep[]; runIdByNodeId: Record<string, string> };

async function planFor(db: Db, input: { orgId: string; canvasId: string; nodeIds: string[] }) {
  const connections = await listConnections(db, { orgId: input.orgId, canvasId: input.canvasId });
  const edges = connections.map((c) => ({ sourceNodeId: c.sourceNodeId, targetNodeId: c.targetNodeId }));

  const nodes = await Promise.all(input.nodeIds.map((id) => findNode(db, { orgId: input.orgId, nodeId: id })));
  const nodeTypesById = new Map<string, string>();
  const nodesById = new Map<string, CanvasNodeRecord>();
  for (const node of nodes) {
    if (!node) continue;
    nodeTypesById.set(node.id, node.type);
    nodesById.set(node.id, node);
  }

  const plan = planWorkflow(input.nodeIds, edges, nodeTypesById);
  return { plan, nodesById };
}

export type WorkflowPlanInput = { orgId: string; canvasId: string; nodeIds: string[] };

export async function planWorkflowDryRun(db: Db, input: WorkflowPlanInput) {
  const { plan } = await planFor(db, input);
  return plan;
}

/**
 * VALIDA E METTE IN CODA — non gira niente. Un biglietto per passo, come `enqueueLoop`: la stessa
 * forma di `node_runs.params`, `workflow` al posto di `loop`. `dependsOn` porta gli ID DEI RUN
 * (non dei nodi) dei passi da cui dipende, così `drainWorkflowQueue` legge lo stato senza dover
 * risalire dal nodo al suo run più recente.
 */
export async function enqueueWorkflow(db: Db, input: WorkflowEnqueueInput): Promise<WorkflowEnqueueOutcome> {
  const { plan, nodesById } = await planFor(db, { orgId: input.orgId, canvasId: input.canvasId, nodeIds: input.nodeIds });

  if (!plan.ok) {
    return { kind: 'refused', error: plan.reason };
  }

  const workflowId = randomUUID();
  const runIdByNodeId: Record<string, string> = {};

  for (const step of plan.steps) {
    const node = nodesById.get(step.nodeId);
    const dependsOnRunIds = step.dependsOn.map((depNodeId) => runIdByNodeId[depNodeId]).filter((id): id is string => Boolean(id));

    const ticket: WorkflowTicket = {
      phase: 'queued',
      workflowId,
      dependsOn: dependsOnRunIds,
      projectId: input.projectId,
      canvasId: input.canvasId,
      userId: input.userId
    };

    const run = await createRun(db, {
      orgId: input.orgId,
      nodeId: step.nodeId,
      prompt: typeof node?.data.prompt === 'string' ? node.data.prompt : '',
      model: typeof node?.data.model === 'string' ? node.data.model : null,
      params: { workflow: ticket },
      actorKind: input.actor?.kind ?? 'user',
      actorId: input.actor?.id ?? input.userId
    });

    runIdByNodeId[step.nodeId] = run.id;
    await setRunning(db, { orgId: input.orgId, nodeId: step.nodeId, running: true, actor: input.actor });
  }

  return { kind: 'enqueued', workflowId, steps: plan.steps, runIdByNodeId };
}

const BLOCKED_MESSAGE = (nodeName: string) => `Fermato: ${nodeName} non è riuscito`;

async function runStep(
  db: Db,
  run: NodeRun,
  ticket: WorkflowTicket
): Promise<{ outcome: 'done'; assetId: string; costUsd: number | null } | { outcome: 'failed'; error: string }> {
  const node = await findNode(db, { orgId: run.orgId, nodeId: run.nodeId });
  if (!node) {
    return { outcome: 'failed', error: 'node_not_found' };
  }

  const medium = (node.type === 'text' || node.type === 'video' ? node.type : 'image') as GenMedium;
  const model = typeof node.data.model === 'string' && node.data.model ? node.data.model : DEFAULT_MODEL[medium];
  const prompt = typeof node.data.prompt === 'string' ? node.data.prompt : '';

  const startRun: StartRun = {
    orgId: run.orgId,
    projectId: ticket.projectId,
    canvasId: ticket.canvasId,
    nodeId: run.nodeId,
    userId: ticket.userId,
    medium,
    prompt,
    model,
    params: (node.data.params ?? {}) as StartRun['params'],
    expectedVersion: node.version,
    actor: { kind: 'agent', id: ticket.userId, agentKey: 'workflow' }
  };

  const out = await runGenNode(db, startRun);

  if (out.kind === 'done') {
    return { outcome: 'done', assetId: out.asset.id, costUsd: out.run.costUsd ?? null };
  }
  if (out.kind === 'queued') {
    return { outcome: 'failed', error: 'video_pending' };
  }
  if (out.kind === 'conflict') {
    return { outcome: 'failed', error: 'conflict' };
  }
  return { outcome: 'failed', error: out.error };
}

export type WorkflowDrainOutcome = { claimed: number; done: number; failed: number; blocked: number };

async function statusesOf(runsById: Map<string, NodeRun>, runIds: string[]): Promise<StepStatus[]> {
  return runIds.map((id) => (runsById.get(id)?.status ?? 'running') as StepStatus);
}

/**
 * DRENA UN LOTTO — per ogni biglietto in coda, legge lo stato dei run da cui dipende
 * (`stepReadiness`): pronto → reclama e gira col motore vero; bloccato → chiude `failed` col
 * messaggio che nomina il passo fallito, senza girare; in attesa → salta, il prossimo tick
 * riprova. Un passo video resta `running` sul suo run reale finché `reconcileVideoNodeRuns` non
 * lo chiude: i suoi dipendenti restano `waiting` fino ad allora, nessuna logica speciale qui.
 */
async function drainWorkflowQueuePass(db: Db, opts: { limit: number }): Promise<WorkflowDrainOutcome> {
  const running = await runningRuns(db, { limit: opts.limit * 8 });
  const tickets = running.filter((r) => ticketOf(r) !== null).slice(0, opts.limit);
  const dependencyIds = [...new Set(tickets.flatMap((r) => ticketOf(r)?.dependsOn ?? []))];
  const runsById = new Map((await runsByIds(db, { ids: dependencyIds })).map((r) => [r.id, r]));

  let claimed = 0;
  let done = 0;
  let failed = 0;
  let blocked = 0;

  for (const run of tickets) {
    const ticket = ticketOf(run);
    if (!ticket) continue;

    const statuses = await statusesOf(runsById, ticket.dependsOn);
    const readiness = stepReadiness(statuses);

    if (readiness === 'waiting') continue;

    const won = await claimRun(db, { orgId: run.orgId, runId: run.id });
    if (!won) continue;
    claimed += 1;

    if (readiness === 'blocked') {
      const failedDepId = ticket.dependsOn.find((id) => {
        const s = runsById.get(id)?.status;
        return s === 'failed' || s === 'expired';
      });
      const failedNode = failedDepId ? await findNode(db, { orgId: run.orgId, nodeId: runsById.get(failedDepId)!.nodeId }).catch(() => null) : null;
      const nodeName = failedNode?.displayName ?? failedNode?.type ?? 'un passo precedente';

      await failRun(db, { orgId: run.orgId, runId: run.id, error: BLOCKED_MESSAGE(nodeName) });
      await setRunning(db, { orgId: run.orgId, nodeId: run.nodeId, running: false });
      blocked += 1;
      continue;
    }

    const result = await runStep(db, run, ticket);

    if (result.outcome === 'done') {
      await completeRun(db, { orgId: run.orgId, runId: run.id, assetId: result.assetId, costUsd: result.costUsd });
      await setRunning(db, { orgId: run.orgId, nodeId: run.nodeId, running: false });
      done += 1;
    } else {
      await failRun(db, { orgId: run.orgId, runId: run.id, error: result.error });
      await setRunning(db, { orgId: run.orgId, nodeId: run.nodeId, running: false });
      failed += 1;
    }
  }

  return { claimed, done, failed, blocked };
}

const WORKFLOW_DRAIN_BUDGET_MS = 240_000;
const WORKFLOW_DRAIN_MAX_PASSES = 50;

function addOutcome(total: WorkflowDrainOutcome, pass: WorkflowDrainOutcome): WorkflowDrainOutcome {
  return {
    claimed: total.claimed + pass.claimed,
    done: total.done + pass.done,
    failed: total.failed + pass.failed,
    blocked: total.blocked + pass.blocked
  };
}

function madeProgress(pass: WorkflowDrainOutcome): boolean {
  return pass.claimed > 0;
}

/**
 * RIPETE I PASSAGGI FINCHÉ UNO SBLOCCA IL SUCCESSIVO — un passo appena finito (`done`) sblocca
 * subito il suo dipendente, invece di aspettare il prossimo tick del cron (un minuto): il secondo
 * `drainWorkflowQueuePass` lo vede già `waiting` diventato `ready`. Si ferma quando un passaggio
 * non reclama più nulla, o quando il budget di tempo del tick finisce — mai a metà di un passo in
 * corso, solo tra un passaggio e il successivo.
 */
export async function drainWorkflowQueue(db: Db, opts: { limit: number }): Promise<WorkflowDrainOutcome> {
  const deadline = Date.now() + WORKFLOW_DRAIN_BUDGET_MS;
  let total: WorkflowDrainOutcome = { claimed: 0, done: 0, failed: 0, blocked: 0 };

  for (let pass = 0; pass < WORKFLOW_DRAIN_MAX_PASSES && Date.now() < deadline; pass += 1) {
    const outcome = await drainWorkflowQueuePass(db, opts);
    total = addOutcome(total, outcome);
    if (!madeProgress(outcome)) break;
  }

  return total;
}

export type WorkflowCancelInput = { orgId: string; workflowId: string };
export type WorkflowCancelOutcome = { cancelled: number };

export async function cancelWorkflow(db: Db, input: WorkflowCancelInput): Promise<WorkflowCancelOutcome> {
  const running = await runningRuns(db, { limit: 2000 });
  const mine = running.filter((r) => ticketOf(r)?.workflowId === input.workflowId);

  let cancelled = 0;
  for (const run of mine) {
    const won = await claimRun(db, { orgId: run.orgId, runId: run.id });
    if (!won) continue;

    await failRun(db, { orgId: run.orgId, runId: run.id, error: 'cancelled' });
    await setRunning(db, { orgId: run.orgId, nodeId: run.nodeId, running: false });
    cancelled += 1;
  }

  return { cancelled };
}
