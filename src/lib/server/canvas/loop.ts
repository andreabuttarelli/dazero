/**
 * IL LOOP: da UN nodo di generazione con archi `iterate` (o un semplice "repeat N") a N GIRI
 * REALI, ciascuno attraverso `runGenNode` — lo stesso motore del bottone «Genera», mai una copia
 * (CLAUDE.md: la stessa disciplina di `run_node_generation`, l'MCP, la rotta `run`).
 *
 *   planLoop      →  il preventivo: quante combinazioni, quanti crediti, senza girare niente.
 *   enqueueLoop   →  ricontrolla le stesse soglie (un preventivo letto un minuto prima non è un
 *                     permesso), crea l'output `list` con un item PLACEHOLDER per combinazione, e
 *                     mette in coda N "biglietti" (righe `node_runs`) — POI RITORNA. Non gira
 *                     niente da sé.
 *   drainLoopQueue →  chiamata dal cron esistente (`canvas/runs/tick`, ogni minuto): reclama un
 *                     lotto di biglietti in coda, li gira UNO alla volta, chiude ciascuno.
 *
 * PERCHÉ NON PIÙ UNA RICHIESTA SOLA. La prima versione girava tutte le combinazioni IN SEQUENZA
 * dentro un'unica richiesta HTTP — e un'immagine impiega 40-70s: con `maxDuration` a 300s (la
 * stessa rotta `run`) o anche 800s (il tetto massimo di Vercel), un loop da 50 o 1000 combinazioni
 * si sarebbe fermato a metà QUANDO LA PIATTAFORMA UCCIDE LA RICHIESTA, senza che nessuna
 * combinazione restante venisse mai più ripresa — le soglie di sicurezza (`LOOP_CONFIRM_ABOVE`,
 * `LOOP_MAX`) promettevano un numero che l'esecutore non poteva mantenere. La coda risolve questo
 * spezzando il lavoro in unità che il cron dei minuti successivi continua a drenare: un loop da
 * 1000 finisce in più tick, mai per metà per sempre.
 *
 * UN BIGLIETTO È UNA RIGA `node_runs` COME UN'ALTRA, non una tabella nuova — nessuna colonna in
 * più, nessuna migrazione: `status = 'running'` con `params.loop = {phase: 'queued', …}` è lo
 * stesso trucco che `queuedVideoRuns` già usa (`status='running'` + `external_job_id` non nullo)
 * per distinguere "in corso davvero" da "in attesa che qualcosa la finisca". Il claim atomico
 * (`claimRun`, `status='running' → 'finishing'` con zero righe = "qualcun altro l'ha già presa")
 * è lo STESSO che il riconciliatore video usa — due tick sovrapposti non drenano mai lo stesso
 * biglietto due volte.
 *
 * `expireStuckRuns` (in `generate.ts`) deve SAPERE di questi biglietti: senza, un biglietto ancora
 * in coda da più di `RUN_STALE_MS` (6 minuti — un loop lungo ci arriva facilmente) verrebbe
 * scambiato per un giro perso e chiuso `expired` mentre aspettava solo il suo turno. Il filtro
 * vive lì (vedi il commento su `expireStuckRuns`), non qui: un biglietto NON è "perso" per la sola
 * età, lo è solo se claimed (`finishing`) e mai tornato — lo stesso gap che i giri video hanno già
 * oggi, non uno nuovo che questo file introduce.
 *
 * CANCELLAZIONE: i biglietti ancora `queued` (mai reclamati) si chiudono `failed` con
 * `error: 'cancelled'` — la stessa forma di un fallimento vero, distinta dal messaggio. Un
 * biglietto già reclamato da un tick finisce comunque: cancellare non interrompe una generazione
 * già partita, ferma solo quelle che non sono ancora cominciate — la stessa dottrina "i risultati
 * completati sopravvivono" del disegno originale.
 */
import type { Db } from '$lib/server/db/client';
import { runGenNode, type StartRun } from '$lib/server/canvas/generate';
import { findNode, createNode, writeNodeData, listConnections, listNodes, type CanvasNodeRecord } from '$lib/server/repos/canvas';
import {
  createRun,
  claimRun,
  completeRun,
  failRun,
  runningRuns,
  type NodeRun
} from '$lib/server/repos/node-runs';
import { planCombinations, loopSafety, type LoopCombine, type PlannedCombination, type LoopSafety } from '$lib/canvas/loop-plan';
import { axesFrom, iterateSelectionFor, type LoopEdge, type LoopSourceNode } from '$lib/canvas/loop-axes';
import { estimateLoopCredits, type LoopCostEstimate } from './loop-cost';
import { resolvedListValues, upstreamInputsFor } from './upstream';
import { orgCreditBalance } from '$lib/server/credits';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { Actor } from '$lib/server/repos/actor';
import type { GenMedium } from '$lib/canvas/gen-node';

type ListItem = { label?: string; asset_id?: string; text?: string; url?: string; status?: 'queued' | 'done' | 'failed'; run_id?: string };

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
  const [nodes, connections] = await Promise.all([
    listNodes(db, { orgId: scope.orgId, canvasId: scope.canvasId }),
    listConnections(db, { orgId: scope.orgId, canvasId: scope.canvasId })
  ]);
  const canvasNodes = new Map(nodes.map((n) => [n.id, n]));
  const incoming = connections.filter((c) => c.targetNodeId === scope.nodeId);

  const nodesById = new Map<string, LoopSourceNode>();
  for (const edge of incoming) {
    const source = canvasNodes.get(edge.sourceNodeId);
    if (!source) continue;
    const itemCount = source.type === 'list'
      ? (await resolvedListValues(db, scope.orgId, source, connections, canvasNodes)).values.length
      : 0;
    nodesById.set(source.id, { id: source.id, type: source.type, itemCount });
  }

  const edges: LoopEdge[] = incoming.map((c) => ({ sourceNodeId: c.sourceNodeId, targetNodeId: c.targetNodeId, mode: c.mode }));

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

/** Il preventivo: stessa pianificazione di `enqueueLoop`, senza scrivere niente — CLAUDE.md lo
 *  chiede esplicito prima del clic. */
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

/**
 * I CREDITI PER TUTTO IL LOOP, PRIMA DI METTERE IN CODA UNA SOLA COMBINAZIONE — CLAUDE.md lo
 * chiede esplicito: non scoperti vuoti a metà strada. `runGenNode` non gatekeeps da sé (lo fa
 * sempre chi chiama, `gateOrgAiAction` nella rotta/azione) — qui si fa la STESSA domanda ma sul
 * totale stimato, leggendo `orgCreditBalance` (il saldo vero di `credit_ledger`, via la RPC
 * `org_credit_balance`) — LA STESSA lettura che `gateOrgCreditsCore`/`ledgerCreditsUsage` usano
 * per il cancello di un giro solo, da quando quel cancello è passato dalla vecchia quota mensile
 * al saldo del ledger. Leggerne una diversa qui darebbe un preventivo che il gate vero smentisce.
 */
async function wholeLoopCreditsAvailable(orgId: string, cost: LoopCostEstimate): Promise<boolean> {
  const admin = createAdminClient();
  try {
    const balance = await orgCreditBalance(admin, orgId);
    return balance >= cost.total;
  } catch {
    // Fail-open, come `gateOrgCreditsCore`: un saldo illeggibile non deve bloccare un loop che
    // altrimenti sarebbe legittimo — la stessa scelta, per lo stesso motivo, di `reportFailOpen`.
    return true;
  }
}

export type LoopEnqueueInput = {
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

/** Cosa un biglietto porta in `node_runs.params.loop` — tutto ciò che `drainLoopQueue` deve sapere
 *  per girare quella combinazione SENZA rileggere il piano intero da capo. */
type LoopTicket = {
  phase: 'queued';
  outputListNodeId: string;
  label: string;
  values: Record<string, string>;
  projectId: string;
  canvasId: string;
  userId: string;
};

export type LoopEnqueueOutcome =
  | { kind: 'refused'; error: string }
  | { kind: 'needs_confirmation'; count: number; cost: LoopCostEstimate }
  | { kind: 'enqueued'; total: number; outputListNodeId: string; runIds: string[] };

/**
 * IL NODO `list` DI OUTPUT, CON UN PLACEHOLDER PER COMBINAZIONE — nasce già della lunghezza
 * giusta (`status: 'queued'` su ogni item), così il progresso è visibile dal primo istante anche
 * prima che il cron abbia drenato un solo biglietto. `data.outputListNodeId` sul nodo di loop
 * porta il legame, come `refId` porta l'ultimo risultato di un nodo che genera — un loop
 * rilanciato non lascia una lista orfana per ogni giro, RIUSA quella che già esiste, azzerando i
 * suoi item alla lunghezza nuova.
 */
async function createOutputList(
  db: Db,
  input: LoopEnqueueInput,
  node: CanvasNodeRecord,
  combinations: PlannedCombination[]
): Promise<string> {
  const items: ListItem[] = combinations.map((c) => ({ label: c.label || 'variante', status: 'queued' }));
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
 * VALIDA, CONTROLLA I CREDITI DEL TOTALE, METTE IN CODA — E RITORNA SUBITO. Nessuna generazione
 * parte da questa funzione: `drainLoopQueue`, chiamata dal cron, fa quel lavoro un biglietto alla
 * volta nei minuti successivi.
 */
export async function enqueueLoop(db: Db, input: LoopEnqueueInput): Promise<LoopEnqueueOutcome> {
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

  const outputListNodeId = await createOutputList(db, input, node, plan.combinations);

  const runIds: string[] = [];
  for (const combination of plan.combinations) {
    const ticket: LoopTicket = {
      phase: 'queued',
      outputListNodeId,
      label: combination.label,
      values: combination.values,
      projectId: input.projectId,
      canvasId: input.canvasId,
      userId: input.userId
    };
    const run = await createRun(db, {
      orgId: input.orgId,
      nodeId: input.nodeId,
      prompt: typeof node.data.prompt === 'string' ? node.data.prompt : '',
      model,
      params: { loop: ticket },
      actorKind: input.actor?.kind ?? 'user',
      actorId: input.actor?.id ?? input.userId
    });
    runIds.push(run.id);
  }

  return { kind: 'enqueued', total: plan.combinations.length, outputListNodeId, runIds };
}

/** Un biglietto in `node_runs.params.loop`, o `null` quando la riga non ne porta uno — un giro
 *  ordinario (`run` cliccato a mano, l'MCP) non ha mai questa forma in `params`. */
function ticketOf(run: NodeRun): LoopTicket | null {
  const raw = run.params.loop;
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<LoopTicket>;
  if (t.phase !== 'queued' || typeof t.outputListNodeId !== 'string') return null;
  return t as LoopTicket;
}

export function isLoopTicket(run: NodeRun): boolean {
  return ticketOf(run) !== null;
}

/**
 * UNA COMBINAZIONE, GIRATA COL MOTORE VERO. `expectedVersion` rilegge la versione FRESCA del nodo
 * a ogni giro — non quella catturata all'inizio del loop — perché `runGenNode` la consuma
 * scrivendo `running: true` prima di generare: la seconda combinazione con la versione della
 * prima trova SEMPRE un conflitto, altrimenti.
 */
async function runOneCombination(
  db: Db,
  ctx: { orgId: string; projectId: string; canvasId: string; nodeId: string; userId: string; actor?: Actor },
  node: CanvasNodeRecord,
  combination: PlannedCombination
): Promise<
  | { outcome: 'done'; assetId: string; assetUrl: string | null; costUsd: number | null }
  | { outcome: 'failed'; error: string }
> {
  const medium = (node.type === 'text' || node.type === 'video' ? node.type : 'image') as GenMedium;
  const model = typeof node.data.model === 'string' ? node.data.model : null;
  const basePrompt = typeof node.data.prompt === 'string' ? node.data.prompt : '';

  const iterateSelection = iterateSelectionFor(combination.values);
  const upstream = await upstreamInputsFor(db, {
    orgId: ctx.orgId,
    canvasId: ctx.canvasId,
    nodeId: ctx.nodeId,
    model,
    medium: medium === 'video' ? 'video' : medium === 'text' ? 'text' : 'image',
    iterateSelection
  });

  if (upstream.blocked) {
    return { outcome: 'failed', error: upstream.blocked };
  }

  const fresh = await findNode(db, { orgId: ctx.orgId, nodeId: ctx.nodeId });
  if (!fresh) {
    return { outcome: 'failed', error: 'node_not_found' };
  }

  const startRun: StartRun = {
    orgId: ctx.orgId,
    projectId: ctx.projectId,
    canvasId: ctx.canvasId,
    nodeId: ctx.nodeId,
    userId: ctx.userId,
    medium,
    prompt: basePrompt,
    model,
    params: (node.data.params ?? {}) as StartRun['params'],
    expectedVersion: fresh.version,
    actor: ctx.actor,
    iterateSelection
  };

  const out = await runGenNode(db, startRun);

  if (out.kind === 'done') {
    return { outcome: 'done', assetId: out.asset.id, assetUrl: out.asset.url ?? null, costUsd: out.run.costUsd ?? null };
  }
  if (out.kind === 'queued') {
    // Un video in loop resta "in corso" sul suo giro reale (`runGenNode` l'ha già messo in coda
    // per il riconciliatore video) — dal punto di vista del BIGLIETTO questo è comunque un
    // fallimento a chiudere ORA: il video non atterra in questo tick, e questo file non insegue
    // un secondo giro asincrono dentro un giro asincrono. Il loop su un nodo video resta un caso
    // che l'output list non completa da solo, dichiarato apertamente invece di far finta.
    return { outcome: 'failed', error: 'video_not_supported_in_loop_yet' };
  }
  if (out.kind === 'conflict') {
    return { outcome: 'failed', error: 'conflict' };
  }
  return { outcome: 'failed', error: out.error };
}

/** Aggiorna L'ITEM di questa combinazione nel nodo `list` di output — mai gli altri, mai
 *  un'operazione su tutta la lista: ogni biglietto tocca UN item, il proprio. */
async function updateOutputItem(
  db: Db,
  input: { orgId: string; outputListNodeId: string; label: string; actor?: Actor },
  patch: Partial<ListItem>
): Promise<void> {
  const list = await findNode(db, { orgId: input.orgId, nodeId: input.outputListNodeId });
  if (!list) return;

  const items = listItemsOf(list).map((item) => (item.label === input.label ? { ...item, ...patch } : item));

  await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: input.outputListNodeId,
    expectedVersion: list.version,
    actor: input.actor,
    data: { item_kind: 'image', items }
  }).catch(() => {});
}

export type LoopDrainOutcome = { claimed: number; done: number; failed: number };

/**
 * IL CUORE DELLA DURABILITÀ: chiamata dal cron `canvas/runs/tick`, ogni minuto. Reclama un LOTTO
 * di biglietti in coda (mai tutti — un tick ha il suo stesso `maxDuration`), li gira uno alla
 * volta (stesso motivo del disegno precedente: niente `Promise.all` contro il provider), chiude
 * ciascuno indipendentemente dagli altri.
 *
 * IL CLAIM VIENE PRIMA DI OGNI SCRITTURA NON IDEMPOTENTE — la stessa disciplina di
 * `reconcileVideoNodeRuns`: due tick sovrapposti (un tick lento e il successivo che parte
 * comunque) non devono girare e fatturare la stessa combinazione due volte. Zero righe dal claim
 * vuol dire che un altro tick l'ha già presa — si passa oltre senza toccarla.
 */
export async function drainLoopQueue(db: Db, opts: { limit: number }): Promise<LoopDrainOutcome> {
  const running = await runningRuns(db, { limit: opts.limit * 4 });
  const tickets = running.filter((r) => ticketOf(r) !== null).slice(0, opts.limit);

  let claimed = 0;
  let done = 0;
  let failed = 0;

  for (const run of tickets) {
    const ticket = ticketOf(run);
    if (!ticket) continue;

    const won = await claimRun(db, { orgId: run.orgId, runId: run.id });
    if (!won) continue;
    claimed += 1;

    const node = await findNode(db, { orgId: run.orgId, nodeId: run.nodeId }).catch(() => null);
    if (!node) {
      await failRun(db, { orgId: run.orgId, runId: run.id, error: 'node_not_found' }).catch(() => {});
      failed += 1;
      continue;
    }

    const combination: PlannedCombination = { label: ticket.label, values: ticket.values };
    const ctx = {
      orgId: run.orgId,
      projectId: ticket.projectId,
      canvasId: ticket.canvasId,
      nodeId: run.nodeId,
      userId: ticket.userId,
      actor: { kind: 'agent' as const, id: ticket.userId, agentKey: 'loop' }
    };

    const result = await runOneCombination(db, ctx, node, combination);

    if (result.outcome === 'done') {
      await completeRun(db, { orgId: run.orgId, runId: run.id, assetId: result.assetId, costUsd: result.costUsd });
      await updateOutputItem(db, { orgId: run.orgId, outputListNodeId: ticket.outputListNodeId, label: ticket.label }, {
        status: 'done',
        asset_id: result.assetId,
        run_id: run.id
      });
      done += 1;
    } else {
      await failRun(db, { orgId: run.orgId, runId: run.id, error: result.error });
      await updateOutputItem(db, { orgId: run.orgId, outputListNodeId: ticket.outputListNodeId, label: ticket.label }, {
        status: 'failed'
      });
      failed += 1;
    }
  }

  return { claimed, done, failed };
}

export type LoopCancelInput = { orgId: string; nodeId: string };
export type LoopCancelOutcome = { cancelled: number };

/**
 * FERMA I BIGLIETTI NON ANCORA RECLAMATI — quelli già presi da un tick finiscono comunque (una
 * generazione partita non si interrompe a metà), la stessa dottrina "i risultati completati
 * sopravvivono" del disegno originale. `claimRun` è ANCHE qui il modo giusto di fermarne uno: se
 * lo vince, era ancora `queued` per davvero, e lo si chiude `failed`/`cancelled` invece di girarlo.
 */
export async function cancelLoop(db: Db, input: LoopCancelInput): Promise<LoopCancelOutcome> {
  const running = await runningRuns(db, { limit: 2000 });
  const mine = running.filter((r) => r.nodeId === input.nodeId && ticketOf(r) !== null);

  let cancelled = 0;
  for (const run of mine) {
    const ticket = ticketOf(run);
    if (!ticket) continue;

    const won = await claimRun(db, { orgId: run.orgId, runId: run.id });
    if (!won) continue;

    await failRun(db, { orgId: run.orgId, runId: run.id, error: 'cancelled' });
    await updateOutputItem(db, { orgId: run.orgId, outputListNodeId: ticket.outputListNodeId, label: ticket.label }, {
      status: 'failed'
    });
    cancelled += 1;
  }

  return { cancelled };
}

export type RetryComboInput = {
  orgId: string;
  projectId: string;
  canvasId: string;
  nodeId: string;
  userId: string;
  outputListNodeId: string;
  combination: PlannedCombination;
  actor?: Actor;
};

export type LoopComboOutcome =
  | { combination: PlannedCombination; outcome: 'done'; assetId: string; assetUrl: string | null }
  | { combination: PlannedCombination; outcome: 'failed'; error: string };

/**
 * RITENTA UNA SOLA COMBINAZIONE, SUBITO — non in coda: è UNA generazione, non un loop, e la
 * durabilità che `enqueueLoop`/`drainLoopQueue` esistono per dare riguarda N combinazioni dentro
 * una richiesta sola, non una. Aggiorna SOLO l'item corrispondente nella lista di output.
 */
export async function retryLoopCombination(db: Db, input: RetryComboInput): Promise<LoopComboOutcome> {
  const node = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });
  if (!node) {
    return { combination: input.combination, outcome: 'failed', error: 'node_not_found' };
  }

  const result = await runOneCombination(db, input, node, input.combination);

  if (result.outcome === 'done') {
    await updateOutputItem(db, { orgId: input.orgId, outputListNodeId: input.outputListNodeId, label: input.combination.label }, {
      status: 'done',
      asset_id: result.assetId
    });
    return { combination: input.combination, outcome: 'done', assetId: result.assetId, assetUrl: result.assetUrl };
  }

  await updateOutputItem(db, { orgId: input.orgId, outputListNodeId: input.outputListNodeId, label: input.combination.label }, {
    status: 'failed'
  });
  return { combination: input.combination, outcome: 'failed', error: result.error };
}
