/**
 * IL LOOP: da UN nodo di generazione con archi `iterate` (o un semplice "repeat N") a N GIRI
 * REALI, ciascuno attraverso `runGenNode` — lo stesso motore del bottone «Genera», mai una copia
 * (CLAUDE.md: la stessa disciplina di `run_node_generation`, l'MCP, la rotta `run`).
 *
 *   planLoop   →  il preventivo: quante combinazioni, quanti crediti, senza girare niente.
 *   runLoop    →  esegue davvero: ricontrolla le stesse soglie (un preventivo letto un minuto
 *                 prima non è un permesso), poi UNA `runGenNode` per combinazione, in sequenza —
 *                 vedi sotto perché non in parallelo — e deposita ogni risultato in un nodo
 *                 `list` di output, creato o aggiornato accanto al nodo di loop.
 *
 * PERCHÉ IN SEQUENZA E NON IN PARALLELO: Vercel dà UNA richiesta HTTP con UN `maxDuration` (300s,
 * lo stesso della rotta `run` in `+page.server.ts`) — non un worker esterno (il task lo vieta
 * esplicitamente). Un `Promise.all` su N combinazioni concentrerebbe N chiamate al provider nello
 * stesso istante, che è il modo più veloce di far scattare il rate limit del provider stesso, non
 * di finire prima: ogni generazione impiega secondi, non millisecondi, quindi il collo di
 * bottiglia è il provider, non l'attesa fra un giro e il successivo. La sequenza porta anche un
 * beneficio che un parallelismo perderebbe: fra una combinazione e la successiva si può controllare
 * la cancellazione cooperativa (`data.loopCancelledAt` sul nodo) — un batch parallelo non ha un
 * punto dove fermarsi a metà.
 *
 * NESSUNA COLONNA NUOVA: raggruppare le run di UN loop userebbe `node_runs.loop_id`, ma quella
 * colonna non è ancora applicata (`20260923_loop_nodes.sql`, pendente) — vedi LESSONS.md, "mai
 * codice vivo che dipende da una migrazione non applicata". Finché non lo è, l'unico modo di
 * "quali run appartengono a questo loop" è quello che `runLoop` restituisce nella sua stessa
 * risposta, e il nodo di output porta `run_id` per item — la cancellazione e il retry di UNA
 * combinazione bastano quell'id, non hanno bisogno di interrogare il database per gruppo.
 */
import type { Db } from '$lib/server/db/client';
import { runGenNode, type StartRun } from '$lib/server/canvas/generate';
import { findNode, createNode, writeNodeData, listConnections, type CanvasNodeRecord } from '$lib/server/repos/canvas';
import { planCombinations, loopSafety, type LoopCombine, type PlannedCombination, type LoopSafety } from '$lib/canvas/loop-plan';
import { axesFrom, iterateSelectionFor, type LoopEdge, type LoopSourceNode } from '$lib/canvas/loop-axes';
import { estimateLoopCredits, type LoopCostEstimate } from './loop-cost';
import { upstreamInputsFor } from './upstream';
import { readOrgBillingById, orgCreditsUsage } from '$lib/server/credits';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { Actor } from '$lib/server/repos/actor';
import type { GenMedium } from '$lib/canvas/gen-node';

type ListItem = { label?: string; asset_id?: string; text?: string; url?: string };

function listItemsOf(node: CanvasNodeRecord): ListItem[] {
  return Array.isArray(node.data.items) ? (node.data.items as ListItem[]) : [];
}

/** `repeat`/`combine` vivono in `data.params` — lo stesso `GenParams` che `aspectRatio`/`duration`/
 *  `audio` già usano (`canvas-node-data.ts::genData`), non un campo top-level nuovo: un nodo che
 *  genera ha UN oggetto di parametri, non due posti diversi a seconda di quale parametro è. */
function paramsOf(node: CanvasNodeRecord): Record<string, unknown> {
  return (node.data.params ?? {}) as Record<string, unknown>;
}

function repeatOf(node: CanvasNodeRecord): number {
  const raw = paramsOf(node).repeat;
  return typeof raw === 'number' && raw >= 1 ? Math.round(raw) : 1;
}

function combineOf(node: CanvasNodeRecord): LoopCombine {
  return paramsOf(node).combine === 'zip' ? 'zip' : 'product';
}

async function axesForNode(db: Db, scope: { orgId: string; canvasId: string; nodeId: string }) {
  const connections = await listConnections(db, { orgId: scope.orgId, canvasId: scope.canvasId });
  const sourceIds = [...new Set(connections.filter((c) => c.targetNodeId === scope.nodeId).map((c) => c.sourceNodeId))];

  const sources = await Promise.all(sourceIds.map((id) => findNode(db, { orgId: scope.orgId, nodeId: id })));
  const nodesById = new Map<string, LoopSourceNode>();
  for (const source of sources) {
    if (!source) continue;
    nodesById.set(source.id, { id: source.id, type: source.type, itemCount: listItemsOf(source).length });
  }

  const edges: LoopEdge[] = connections
    .filter((c) => c.targetNodeId === scope.nodeId)
    .map((c) => ({ sourceNodeId: c.sourceNodeId, targetNodeId: c.targetNodeId, mode: c.mode }));

  return axesFrom(scope.nodeId, edges, nodesById);
}

export type LoopPlanInput = { orgId: string; canvasId: string; nodeId: string };

export type LoopPlanResult = {
  node: CanvasNodeRecord;
  combinations: PlannedCombination[];
  shortestWins: { nodeId: string; length: number } | null;
  rejectedAxes: { nodeId: string; why: string }[];
  safety: LoopSafety;
  cost: LoopCostEstimate;
};

/** Il preventivo: stessa pianificazione di `runLoop`, senza girare niente — CLAUDE.md lo chiede
 *  esplicito prima del clic. */
export async function planLoop(db: Db, input: LoopPlanInput): Promise<LoopPlanResult> {
  const node = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!node) {
    throw new Error('node_not_found');
  }

  const { axes, rejected } = await axesForNode(db, input);
  const plan = planCombinations(axes, combineOf(node), repeatOf(node));
  const medium = (node.type === 'text' || node.type === 'video' ? node.type : 'image') as GenMedium;
  const model = typeof node.data.model === 'string' ? node.data.model : null;
  const cost = estimateLoopCredits({ medium, model, count: plan.combinations.length });
  const safety = loopSafety(plan.combinations.length);

  return { node, combinations: plan.combinations, shortestWins: plan.shortestWins, rejectedAxes: rejected, safety, cost };
}

export type LoopRunInput = {
  orgId: string;
  projectId: string;
  canvasId: string;
  nodeId: string;
  userId: string;
  /** Sopra `LOOP_CONFIRM_ABOVE` serve un `confirmed: true` esplicito — la stessa semantica che
   *  l'MCP porta con lo stesso nome (CLAUDE.md). */
  confirmed?: boolean;
  actor?: Actor;
};

export type LoopComboOutcome =
  | { combination: PlannedCombination; outcome: 'done'; runId: string; assetId: string; assetUrl: string | null }
  | { combination: PlannedCombination; outcome: 'failed'; error: string; runId?: string }
  | { combination: PlannedCombination; outcome: 'queued'; runId: string };

export type LoopRunOutcome =
  | { kind: 'refused'; error: string }
  | { kind: 'needs_confirmation'; count: number; cost: LoopCostEstimate }
  | { kind: 'ran'; results: LoopComboOutcome[]; outputListNodeId: string; cancelled: boolean };

const LOOP_CONCURRENCY = 3;

async function runBatched<T, R>(items: T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function loopCancelled(db: Db, scope: { orgId: string; nodeId: string }): Promise<boolean> {
  const node = await findNode(db, scope).catch(() => null);
  return Boolean(node?.data.loopCancelledAt);
}

/**
 * UNA COMBINAZIONE, GIRATA COL MOTORE VERO. `expectedVersion` rilegge la versione FRESCA del nodo
 * a ogni giro — non quella catturata all'inizio del loop — perché `runGenNode` la consuma scrivendo
 * `running: true` prima di generare: la seconda combinazione con la versione della prima trova
 * SEMPRE un conflitto, altrimenti. Lo stesso motivo per cui `writeNodeDataRetrying` in
 * `generate.ts` rilegge invece di fidarsi di un numero portato da fuori.
 */
async function runOneCombination(
  db: Db,
  input: LoopRunInput,
  node: CanvasNodeRecord,
  combination: PlannedCombination
): Promise<LoopComboOutcome> {
  const medium = (node.type === 'text' || node.type === 'video' ? node.type : 'image') as GenMedium;
  const model = typeof node.data.model === 'string' ? node.data.model : null;
  const basePrompt = typeof node.data.prompt === 'string' ? node.data.prompt : '';

  const iterateSelection = iterateSelectionFor(combination.values);
  const upstream = await upstreamInputsFor(db, {
    orgId: input.orgId,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    model,
    medium: medium === 'video' ? 'video' : medium === 'text' ? 'text' : 'image',
    iterateSelection
  });

  if (upstream.blocked) {
    return { combination, outcome: 'failed', error: upstream.blocked };
  }

  const fresh = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!fresh) {
    return { combination, outcome: 'failed', error: 'node_not_found' };
  }

  const startRun: StartRun = {
    orgId: input.orgId,
    projectId: input.projectId,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    userId: input.userId,
    medium,
    prompt: basePrompt,
    model,
    params: (node.data.params ?? {}) as StartRun['params'],
    expectedVersion: fresh.version,
    actor: input.actor
  };

  const out = await runGenNode(db, startRun);

  if (out.kind === 'done') {
    return { combination, outcome: 'done', runId: out.run.id, assetId: out.asset.id, assetUrl: out.asset.url ?? null };
  }
  if (out.kind === 'queued') {
    return { combination, outcome: 'queued', runId: out.run.id };
  }
  if (out.kind === 'conflict') {
    return { combination, outcome: 'failed', error: 'conflict' };
  }
  return { combination, outcome: 'failed', error: out.error };
}

function outputListItemsOf(results: LoopComboOutcome[]): Record<string, unknown>[] {
  return results
    .filter((r) => r.outcome === 'done')
    .map((r) => ({
      label: r.combination.label || 'variante',
      asset_id: r.assetId,
      run_id: r.runId
    }));
}

/**
 * IL NODO `list` DI OUTPUT: creato accanto al nodo di loop la prima volta, AGGIORNATO le volte
 * dopo — `data.outputListNodeId` sul nodo di loop porta il legame, come `refId` porta l'ultimo
 * risultato di un nodo che genera. Un loop rilanciato non lascia una lista orfana per ogni giro.
 */
async function depositOutputList(
  db: Db,
  input: LoopRunInput,
  node: CanvasNodeRecord,
  results: LoopComboOutcome[]
): Promise<string> {
  const items = outputListItemsOf(results);
  const existingId = typeof node.data.outputListNodeId === 'string' ? node.data.outputListNodeId : null;

  if (existingId) {
    const existing = await findNode(db, { orgId: input.orgId, nodeId: existingId });
    if (existing) {
      await writeNodeData(db, {
        orgId: input.orgId,
        nodeId: existingId,
        expectedVersion: existing.version,
        actor: input.actor,
        data: { item_kind: 'image', items }
      });
      return existingId;
    }
  }

  const created = await createNode(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    canvasId: input.canvasId,
    type: 'list',
    x: node.position.x + (node.size.width ?? 360) + 80,
    y: node.position.y,
    displayName: `${node.displayName ?? 'loop'} — risultati`,
    data: { item_kind: 'image', items },
    actor: input.actor
  });

  return created.id;
}

/**
 * I CREDITI PER TUTTO IL LOOP, PRIMA DI GIRARE UNA SOLA COMBINAZIONE — CLAUDE.md lo chiede
 * esplicito: non scoperti vuoti a metà strada. `runGenNode` non gatekeeps da sé (lo fa sempre
 * chi chiama, `gateOrgAiAction` nella rotta/azione) — qui si fa la STESSA domanda ma sul totale
 * stimato, non sulla singola generazione, con la stessa lettura (`readOrgBillingById` +
 * `orgCreditsUsage`) che `gateOrgCreditsCore` usa per il cancello di un giro solo.
 */
async function wholeLoopCreditsAvailable(orgId: string, cost: LoopCostEstimate): Promise<boolean> {
  const admin = createAdminClient();
  const org = await readOrgBillingById(admin, orgId);
  if (!org) return true;

  const usage = await orgCreditsUsage(admin, org);
  return usage.remaining >= cost.total;
}

export async function runLoop(db: Db, input: LoopRunInput): Promise<LoopRunOutcome> {
  const node = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!node) {
    return { kind: 'refused', error: 'node_not_found' };
  }

  const { axes } = await axesForNode(db, input);
  const plan = planCombinations(axes, combineOf(node), repeatOf(node));
  const safety = loopSafety(plan.combinations.length);

  if (safety.verdict === 'refuse') {
    return { kind: 'refused', error: `troppe combinazioni (${safety.count}): dividi il loop` };
  }

  const medium = (node.type === 'text' || node.type === 'video' ? node.type : 'image') as GenMedium;
  const model = typeof node.data.model === 'string' ? node.data.model : null;
  const cost = estimateLoopCredits({ medium, model, count: plan.combinations.length });

  if (safety.verdict === 'confirm' && !input.confirmed) {
    return { kind: 'needs_confirmation', count: safety.count, cost };
  }

  if (!(await wholeLoopCreditsAvailable(input.orgId, cost))) {
    return { kind: 'refused', error: 'credits_exhausted' };
  }

  const results: LoopComboOutcome[] = [];
  let cancelled = false;

  for (const combination of plan.combinations) {
    if (await loopCancelled(db, { orgId: input.orgId, nodeId: input.nodeId })) {
      cancelled = true;
      break;
    }
    results.push(await runOneCombination(db, input, node, combination));
  }

  const outputListNodeId = await depositOutputList(db, input, node, results);

  return { kind: 'ran', results, outputListNodeId, cancelled };
}

export type RetryComboInput = { orgId: string; projectId: string; canvasId: string; nodeId: string; userId: string; combination: PlannedCombination; actor?: Actor };

/** RITENTA UNA SOLA COMBINAZIONE — lo stesso motore, la stessa risoluzione, e aggiorna SOLO l'item
 *  corrispondente nel nodo `list` di output, senza rilanciare le altre. */
export async function retryLoopCombination(db: Db, input: RetryComboInput): Promise<LoopComboOutcome> {
  const node = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!node) {
    return { combination: input.combination, outcome: 'failed', error: 'node_not_found' };
  }

  const result = await runOneCombination(db, input, node, input.combination);

  const existingId = typeof node.data.outputListNodeId === 'string' ? node.data.outputListNodeId : null;
  if (existingId && result.outcome === 'done') {
    const existing = await findNode(db, { orgId: input.orgId, nodeId: existingId });
    if (existing) {
      const items = listItemsOf(existing).filter((item) => item.label !== result.combination.label);
      items.push({ label: result.combination.label || 'variante', asset_id: result.assetId });
      await writeNodeData(db, {
        orgId: input.orgId,
        nodeId: existingId,
        expectedVersion: existing.version,
        actor: input.actor,
        data: { item_kind: 'image', items }
      });
    }
  }

  return result;
}
