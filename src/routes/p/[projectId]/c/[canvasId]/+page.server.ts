import { registerCanvasUpload, UploadError } from '$lib/server/canvas/upload';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Db } from '$lib/server/db/client';
import { listMemberships } from '$lib/server/repos/orgs';
import { findCanvasForUser } from '$lib/server/canvas/lookup';
import type { Canvas } from '$lib/server/repos/canvas';
import {
  createConnection,
  createNode,
  deleteConnection,
  deleteNode,
  findNode,
  listConnections,
  listNodes,
  moveNode,
  resizeNode,
  setConnectionMode,
  writeNodeData,
  type CanvasNodeRecord
} from '$lib/server/repos/canvas';
import { nodeSize } from '$lib/canvas/node-size';
import { isNodeType, docData, productsOf, socialFeedOf, influencerOf } from '$lib/canvas-node-data';
import { validateNodeData } from '$lib/canvas/node-data';
import type { Actor } from '$lib/server/repos/actor';
import { mintShareToken } from '$lib/canvas/doc-node';
import { clearDocShare, setDocShare } from '$lib/server/repos/doc-share';
import { isCanvasEdgeKind, isWireMode } from '$lib/canvas-edges';
import { canvasModelCatalogue } from '$lib/server/canvas-catalogue';
import { runGenNode, runsOf } from '$lib/server/canvas/generate';
import { planLoop, enqueueLoop, cancelLoop, retryLoopCombination } from '$lib/server/canvas/loop';
import { planWorkflowDryRun, enqueueWorkflow, cancelWorkflow, estimateWorkflowCredits } from '$lib/server/canvas/workflow';
import { listNodeRuns } from '$lib/server/repos/node-runs';
import { duplicateNodes } from '$lib/server/canvas/duplicate';
import { undoGesture } from '$lib/server/canvas/undo';
import type { Gesture, UndoItem } from '$lib/canvas/undo-plan';
import { gateOrgAiActionForForm } from '$lib/server/cli-auth';
import { listNodeProducts } from '$lib/server/repos/products';
import { listNodeSocialPosts } from '$lib/server/repos/social-posts';
import { getInfluencer, listInfluencerViewsByIds, signInfluencerViewFiles } from '$lib/server/repos/influencers';
import { syncProductsNode } from '$lib/server/canvas/products-sync';
import { syncSocialFeedNode } from '$lib/server/canvas/social-feed-sync';
import { isProductPlatform } from '$lib/canvas/products-node';
import { isSocialFeedPlatform } from '$lib/canvas/social-feed-node';
import { createPostFromNodes } from '$lib/server/repos/create-post-from-nodes';
import { findBrand } from '$lib/server/repos/brands';
import { listBrandAccounts } from '$lib/server/repos/social-accounts';
import { promoteNodesToPost } from '$lib/server/repos/post-from-nodes';
import { promoteToPost, setPostStatus, listSourcesForNodes } from '$lib/server/repos/posts';
import { scheduleDelivery } from '$lib/server/repos/post-delivery';
import { publisher } from '$lib/server/publishing';
import { listNodesByIds } from '$lib/server/repos/canvas';
import { suggestNextSteps } from '$lib/canvas/suggest-next-steps';
import { actionFrequencyFor } from '$lib/server/next-step-stats';
import { decideWithJev } from '$lib/server/jev';

// L'azione `run` aspetta la generazione DENTRO la richiesta — un'immagine ci mette fino a un
// minuto, e il default della piattaforma è sotto quella soglia. Senza, la richiesta muore a metà
// e il giro resta `running` senza che nessuno lo chiuda: lo stesso valore che porta ogni altra
// rotta che genera un'immagine (`api/v1/brands/[slug]/media/images`).
export const config = { maxDuration: 300 };

/**
 * LA TELA, DAL LATO DEL SERVER.
 *
 * Una `load` e delle action, e niente fra le due: il componente non parla col database, e queste
 * action sono l'unica porta. Ognuna rifà da sé la domanda «questa tela è sua?» — passare l'org
 * dal client sarebbe farsi dire dal browser dentro quale tenant scrivere.
 *
 * `version` VIAGGIA CON IL CONTENUTO e non con la posizione: il repository tratta le due cose in
 * modo diverso di proposito — trascinare è last-write-wins, scrivere un prompt no — e qui si
 * rispetta quella divisione invece di uniformarla.
 */
type Scope = { db: Db; orgId: string; canvasId: string; canvas: Canvas; userId: string };

/** Ogni gesto della tela che passa da qui è di una persona, mai un `system` muto: `canvas_events` deve saperlo. */
function userActor(scope: { userId: string }): Actor {
  return { kind: 'user', id: scope.userId };
}

async function scopeFor(locals: App.Locals, canvasId: string): Promise<Scope> {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) {
    throw redirect(303, '/login');
  }

  const db = await locals.db();
  if (!db) {
    throw error(500, 'sessione senza client');
  }

  const memberships = await listMemberships(db, user.id);
  const found = await findCanvasForUser(db, { canvasId, memberships });
  if (!found) {
    throw error(404, 'questa tela non esiste, o non è tua');
  }

  return { db, orgId: found.orgId, canvasId, canvas: found.canvas, userId: user.id };
}

/** La storia dei giri, per nodo: quello che la striscia sotto il risultato deve poter mostrare. */
async function loadGenRuns(
  db: Db,
  scope: { orgId: string; nodes: Awaited<ReturnType<typeof listNodes>> }
): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(
    scope.nodes.map(async (node) => [node.id, await runsOf(db, { orgId: scope.orgId, nodeId: node.id })] as const)
  );
  return Object.fromEntries(entries);
}

/**
 * IL CATALOGO E IL FEED SCARICATI, per nodo: `products`/`social_account_feed` non portano il
 * contenuto in `data` — vive in `products`/`social_posts` — quindi la pagina lo legge qui, come
 * `loadGenRuns` legge `node_runs` per il nodo che produce.
 */
async function loadDownloaded(
  db: Db,
  scope: { orgId: string; canvasId: string; nodes: Awaited<ReturnType<typeof listNodes>> }
): Promise<{
  products: Record<string, unknown[]>;
  socialPosts: Record<string, unknown[]>;
  influencers: Record<string, { name: string; views: { id: string; label: string; url: string | null }[] }>;
}> {
  const influencers: Record<string, { name: string; views: { id: string; label: string; url: string | null }[] }> = {};
  const nodesOfType = (type: string) => scope.nodes.filter((node) => node.type === type);

  const [products, socialPosts] = await Promise.all([
    perNode(nodesOfType('products'), (nodeId) => listNodeProducts(db, { orgId: scope.orgId, nodeId })),
    perNode(nodesOfType('social_account_feed'), (nodeId) => listNodeSocialPosts(db, { orgId: scope.orgId, nodeId })),
    loadInfluencerViews(db, scope.nodes, influencers)
  ]);

  return { products, socialPosts, influencers };
}

async function perNode(nodes: { id: string }[], read: (nodeId: string) => Promise<unknown[]>): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(nodes.map(async (node) => [node.id, await read(node.id)] as const));
  return Object.fromEntries(entries);
}

/**
 * LE VISTE DI OGNI NODO `influencer`, firmate in un colpo solo — non una per nodo: una tela con
 * dieci volti firmerebbe settanta URL a chiamate separate senza questo. `influencer_id` porta a
 * `influencer_views` (mai a `nodes.data`, vedi `influencer-node.ts`); un influencer cancellato o
 * di un'org che non è più questa non compare — `getInfluencer` applica la stessa RLS di ogni
 * altra lettura, senza un controllo qui in più.
 */
async function loadInfluencerViews(
  db: Db,
  nodes: Awaited<ReturnType<typeof listNodes>>,
  out: Record<string, { name: string; views: { id: string; label: string; url: string | null }[] }>
): Promise<void> {
  const influencerNodes = nodes.filter((n) => n.type === 'influencer');
  if (!influencerNodes.length) {
    return;
  }

  const influencerIds = influencerNodes
    .map((n) => (typeof n.data.influencer_id === 'string' ? n.data.influencer_id : null))
    .filter((id): id is string => Boolean(id));

  const [viewsByInfluencer, influencerRows] = await Promise.all([
    listInfluencerViewsByIds(db, influencerIds),
    Promise.all(influencerIds.map((id) => getInfluencer(db, id)))
  ]);

  const allPaths = [...viewsByInfluencer.values()].flatMap((views) => views.map((v) => v.storagePath));
  const signed = await signInfluencerViewFiles(db, allPaths);

  const nameById = new Map(influencerRows.filter((r) => r !== null).map((r) => [r.id, r.name]));

  for (const node of influencerNodes) {
    const influencerId = typeof node.data.influencer_id === 'string' ? node.data.influencer_id : null;
    if (!influencerId) continue;

    const views = viewsByInfluencer.get(influencerId) ?? [];
    out[node.id] = {
      name: nameById.get(influencerId) ?? 'Influencer',
      views: views.map((v) => ({ id: v.id, label: v.label, url: signed.get(v.storagePath) ?? null }))
    };
  }
}

export const load: PageServerLoad = async ({ params, locals }) => {
  const { db, orgId, canvasId, canvas } = await scopeFor(locals, params.canvasId);

  const [nodes, connections, catalogue] = await Promise.all([
    listNodes(db, { orgId, canvasId }),
    listConnections(db, { orgId, canvasId }),
    canvasModelCatalogue()
  ]);

  const [runs, { products, socialPosts, influencers }, sources] = await Promise.all([
    loadGenRuns(db, { orgId, nodes }),
    loadDownloaded(db, { orgId, canvasId, nodes }),
    listSourcesForNodes(db, nodes.map((node) => node.id))
  ]);

  const nodeIdsInPost = [...new Set(sources.map((source) => source.nodeId))];

  return {
    canvas,
    nodes,
    connections,
    catalogue,
    runs,
    products,
    socialPosts,
    influencers,
    projectId: params.projectId,
    orgId,
    nodeIdsInPost
  };
};

/** Un numero che arriva da un form: finito, o la riga nasce con `NaN` dentro una colonna numerica. */
function coord(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * UN `UndoItem` COSÌ COM'È ARRIVATO DAL CLIENT: nessuna validazione di forma oltre "ha un kind che
 * conosciamo e gli id/record che quel kind richiede". Il client l'ha costruito da quello che il
 * server gli aveva già restituito (`inverseOf` legge `before`/`after` di scritture già avvenute),
 * quindi qui non si rivalida `data` come farebbe `create` — è `checkGesture` a decidere se vale
 * ancora applicarlo, guardando lo stato fresco, non la forma del payload.
 */
function parseUndoItem(raw: unknown): UndoItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;

  if (item.kind === 'node.create' && typeof item.nodeId === 'string') {
    return { kind: 'node.create', nodeId: item.nodeId, after: (item.after as Record<string, unknown>) ?? {} };
  }
  if (item.kind === 'node.delete' && typeof item.nodeId === 'string') {
    return { kind: 'node.delete', nodeId: item.nodeId, before: (item.before as Record<string, unknown>) ?? {} };
  }
  if (
    item.kind === 'node.update' &&
    typeof item.nodeId === 'string' &&
    Number.isInteger(item.expectedVersion)
  ) {
    return {
      kind: 'node.update',
      nodeId: item.nodeId,
      before: (item.before as Record<string, unknown>) ?? {},
      after: (item.after as Record<string, unknown>) ?? {},
      expectedVersion: item.expectedVersion as number
    };
  }
  if (item.kind === 'edge.create' && typeof item.edgeId === 'string' && typeof item.sourceNodeId === 'string' && typeof item.targetNodeId === 'string') {
    return { kind: 'edge.create', edgeId: item.edgeId, sourceNodeId: item.sourceNodeId, targetNodeId: item.targetNodeId };
  }
  if (item.kind === 'edge.delete' && typeof item.edgeId === 'string' && typeof item.sourceNodeId === 'string' && typeof item.targetNodeId === 'string') {
    return { kind: 'edge.delete', edgeId: item.edgeId, sourceNodeId: item.sourceNodeId, targetNodeId: item.targetNodeId };
  }
  return null;
}

type SyncNodeOutcome = { ok: true; synced: number; extra?: Record<string, unknown> } | { ok: false; error: string };

/** `products`: `type`/`url`/`limit`/`after`/`only_first_photo` sono la query — `productsOf` li legge già validati. */
async function syncProducts(db: Db, orgId: string, projectId: string | null, node: { id: string; data: Record<string, unknown> }): Promise<SyncNodeOutcome> {
  const parsed = productsOf({ id: node.id, type: 'products', data: node.data });
  if (!parsed || !isProductPlatform(parsed.platform) || !parsed.url.trim()) {
    return { ok: false, error: 'invalid_url: this node has no store URL to sync' };
  }

  const outcome = await syncProductsNode(db, {
    orgId,
    projectId,
    nodeId: node.id,
    platform: parsed.platform,
    storeUrl: parsed.url,
    limit: parsed.limit,
    after: parsed.after,
    onlyFirstPhoto: parsed.onlyFirstPhoto
  });

  return outcome.ok ? { ok: true, synced: outcome.synced, extra: { after: outcome.after } } : outcome;
}

/** `social_account_feed`: `platform`/`handle`/`limit` sono la query. */
async function syncSocialFeed(db: Db, orgId: string, projectId: string | null, node: { id: string; data: Record<string, unknown> }): Promise<SyncNodeOutcome> {
  const parsed = socialFeedOf({ id: node.id, type: 'social_account_feed', data: node.data });
  if (!parsed || !isSocialFeedPlatform(parsed.platform) || !parsed.handle.trim()) {
    return { ok: false, error: 'missing_handle: this node has no handle to sync' };
  }

  return syncSocialFeedNode(db, {
    orgId,
    projectId,
    nodeId: node.id,
    platform: parsed.platform,
    handle: parsed.handle,
    limit: parsed.limit
  });
}

export const actions: Actions = {
  upload: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const path = String(fd.get('path') ?? '');
    const fileName = String(fd.get('file_name') ?? '');
    const mimeType = String(fd.get('mime_type') ?? '');
    const bytes = coord(fd.get('bytes'));
    if (!path || !fileName || !mimeType || bytes === null) {
      return fail(400, { error: 'richiesta non valida' });
    }

    try {
      return await registerCanvasUpload(scope.db, {
        orgId: scope.orgId, projectId: scope.canvas.projectId, canvasId: scope.canvasId,
        path, fileName, mimeType, bytes,
        x: coord(fd.get('x')) ?? 0, y: coord(fd.get('y')) ?? 0
      });
    } catch (cause) {
      if (cause instanceof UploadError) { return fail(cause.status, { error: cause.message }); }
      throw cause;
    }
  },
  snapshot: async ({ params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const [nodes, connections] = await Promise.all([
      listNodes(scope.db, scope), listConnections(scope.db, scope)
    ]);
    const [runs, { products, socialPosts, influencers }] = await Promise.all([
      loadGenRuns(scope.db, { orgId: scope.orgId, nodes }),
      loadDownloaded(scope.db, { orgId: scope.orgId, canvasId: scope.canvasId, nodes })
    ]);
    return { nodes, connections, runs, products, socialPosts, influencers };
  },

  run: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const medium = String(fd.get('medium') ?? '');
    const prompt = String(fd.get('prompt') ?? '');
    const model = String(fd.get('model') ?? '') || null;
    const version = Number(fd.get('version'));
    if (!nodeId || !isNodeType(medium) || !Number.isInteger(version)) {
      return fail(400, { error: 'richiesta non valida' });
    }

    let paramsIn: Record<string, unknown> = {};
    try {
      paramsIn = JSON.parse(String(fd.get('params') ?? '{}')) as Record<string, unknown>;
    } catch {
      return fail(400, { error: 'parametri non leggibili' });
    }

    const denied = await gateOrgAiActionForForm(scope.orgId);
    if (denied) {
      return fail(denied.status, denied.data);
    }

    const out = await runGenNode(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      nodeId,
      userId: scope.userId,
      medium: medium as never,
      prompt,
      model,
      params: paramsIn as never,
      expectedVersion: version
    });

    if (out.kind === 'refused') { return fail(400, { error: out.error }); }
    if (out.kind === 'conflict') { return fail(409, { conflict: true }); }
    return out;
  },

  /**
   * IL PREVENTIVO DEL LOOP: quante combinazioni, quanti crediti — MAI un gate crediti, un
   * preventivo non spende (CLAUDE.md: il nodo mostra il costo prima del clic).
   */
  loop_plan: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    if (!nodeId) {
      return fail(400, { error: 'richiesta non valida' });
    }

    try {
      return await planLoop(scope.db, { orgId: scope.orgId, canvasId: scope.canvasId, nodeId });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'loop_plan_failed';
      return fail(message === 'node_not_found' ? 404 : 400, { error: message });
    }
  },

  /**
   * IL LOOP: METTE IN CODA, non gira — vedi `loop.ts` per il perché. Sopra 50 combinazioni serve
   * `confirm=1` esplicito nel form, sopra 1000 si rifiuta comunque. Il cron
   * (`canvas/runs/tick`, ogni minuto) drena la coda nei minuti successivi: questa azione torna
   * quando i biglietti sono scritti, non quando le immagini esistono.
   */
  run_loop: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    if (!nodeId) {
      return fail(400, { error: 'richiesta non valida' });
    }

    const denied = await gateOrgAiActionForForm(scope.orgId);
    if (denied) {
      return fail(denied.status, denied.data);
    }

    const out = await enqueueLoop(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      nodeId,
      userId: scope.userId,
      confirmed: fd.get('confirm') === '1'
    });

    if (out.kind === 'refused') { return fail(400, { error: out.error }); }
    return out;
  },

  /**
   * CANCELLA IL LOOP: ferma solo i biglietti non ancora reclamati da un tick — quelli già in
   * corso finiscono, e i risultati già completati restano nella lista di output.
   */
  cancel_loop: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    if (!nodeId) {
      return fail(400, { error: 'richiesta non valida' });
    }

    return await cancelLoop(scope.db, { orgId: scope.orgId, nodeId });
  },

  /**
   * RITENTA UN ITEM FALLITO DI UN OUTPUT DI LOOP — subito, non in coda: `loop.ts::retryLoopCombination`.
   * L'item porta solo `label`/`run_id`; i valori dell'iterazione (`params.loop.values`) vivono sul
   * biglietto originale in `node_runs`, e sono quelli che questa azione rilegge invece di
   * indovinarli dall'item — un item che perde il proprio `run_id` (mai dovrebbe accadere dopo
   * `createOutputList`) cade sul confronto per `label`, l'unica altra chiave che un item porta.
   */
  retry_loop_combo: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const outputListNodeId = String(fd.get('output_list_node_id') ?? '');
    const label = String(fd.get('label') ?? '');
    const runId = fd.get('run_id');
    if (!nodeId || !outputListNodeId) {
      return fail(400, { error: 'richiesta non valida' });
    }

    const denied = await gateOrgAiActionForForm(scope.orgId);
    if (denied) {
      return fail(denied.status, denied.data);
    }

    const runs = await listNodeRuns(scope.db, { orgId: scope.orgId, nodeId });
    const ticket = runs.find((run) => {
      const loop = (run.params as { loop?: { outputListNodeId?: string; label?: string } }).loop;
      if (!loop || loop.outputListNodeId !== outputListNodeId) return false;
      if (typeof runId === 'string' && runId) return run.id === runId;
      return loop.label === label;
    });
    const values = (ticket?.params as { loop?: { values?: Record<string, string> } } | undefined)?.loop?.values ?? {};

    const out = await retryLoopCombination(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      nodeId,
      userId: scope.userId,
      outputListNodeId,
      combination: { label, values }
    });

    return out;
  },

  /**
   * IL PREVENTIVO DEL WORKFLOW: pianifica senza scrivere niente, per la conferma prima del clic —
   * la stessa forma di `loop_plan`.
   */
  workflow_plan: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeIds = fd.getAll('node_id').map(String).filter(Boolean);
    if (nodeIds.length < 2) {
      return fail(400, { error: 'richiesta non valida' });
    }

    const plan = await planWorkflowDryRun(scope.db, { orgId: scope.orgId, canvasId: scope.canvasId, nodeIds });
    if (!plan.ok) {
      return fail(400, { error: plan.reason });
    }

    const nodes = await Promise.all(nodeIds.map((id) => findNode(scope.db, { orgId: scope.orgId, nodeId: id })));
    const stepsCost = nodes
      .filter((n): n is CanvasNodeRecord => n !== null)
      .map((n) => ({
        medium: (n.type === 'text' || n.type === 'video' ? n.type : 'image') as 'text' | 'image' | 'video',
        model: typeof n.data.model === 'string' ? n.data.model : null
      }));

    return { steps: plan.steps, estimatedCredits: estimateWorkflowCredits(stepsCost) };
  },

  /**
   * IL WORKFLOW: METTE IN CODA, non gira — vedi `workflow.ts` per il perché, la stessa dottrina
   * del loop. Torna quando i biglietti sono scritti, il cron (`canvas/runs/tick`) li drena nei
   * minuti successivi rispettando le dipendenze fra passi.
   */
  run_workflow: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeIds = fd.getAll('node_id').map(String).filter(Boolean);
    if (nodeIds.length < 2) {
      return fail(400, { error: 'richiesta non valida' });
    }

    const denied = await gateOrgAiActionForForm(scope.orgId);
    if (denied) {
      return fail(denied.status, denied.data);
    }

    const out = await enqueueWorkflow(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      nodeIds,
      userId: scope.userId
    });

    if (out.kind === 'refused') {
      return fail(400, { error: out.error });
    }

    const nodes = await Promise.all(nodeIds.map((id) => findNode(scope.db, { orgId: scope.orgId, nodeId: id })));
    const stepsCost = nodes
      .filter((n): n is CanvasNodeRecord => n !== null)
      .map((n) => ({
        medium: (n.type === 'text' || n.type === 'video' ? n.type : 'image') as 'text' | 'image' | 'video',
        model: typeof n.data.model === 'string' ? n.data.model : null
      }));

    return { workflowId: out.workflowId, steps: out.steps, estimatedCredits: estimateWorkflowCredits(stepsCost) };
  },

  /**
   * CANCELLA IL WORKFLOW: ferma solo i biglietti non ancora reclamati — la stessa dottrina di
   * `cancel_loop`.
   */
  cancel_workflow: async ({ request, locals, params }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const workflowId = String(fd.get('workflow_id') ?? '');
    if (!workflowId) {
      return fail(400, { error: 'richiesta non valida' });
    }

    return await cancelWorkflow(scope.db, { orgId: scope.orgId, workflowId });
  },

  /**
   * SINCRONIZZARE UN NODO `products` O `social_account_feed`. Non è `run`: non c'è un provider
   * asincrono da rincorrere, il giro finisce dentro questa stessa richiesta — quindi lo stato si
   * scrive due volte, "sta scaricando" prima di chiamare il fetcher e il risultato dopo, invece
   * di aprire una `node_runs` per un giro che non ha bisogno di sopravvivere alla richiesta.
   *
   * `projectId` PASSA AL REPO ANCHE QUANDO NULLO: `products`/`social_posts` sono indipendenti da
   * un brand, ma restano del progetto che le ha scaricate — un `project_id` nullo è una riga che
   * la libreria del progetto non trova più.
   */
  sync: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const version = coord(fd.get('version'));
    if (!nodeId || version === null || !Number.isInteger(version) || version < 1) {
      return fail(400, { error: 'richiesta non valida' });
    }

    const node = await findNode(scope.db, { orgId: scope.orgId, nodeId });
    if (!node || (node.type !== 'products' && node.type !== 'social_account_feed')) {
      return fail(404, { error: 'nodo non trovato' });
    }

    const running = await writeNodeData(scope.db, {
      orgId: scope.orgId,
      nodeId,
      expectedVersion: version,
      data: { ...node.data, sync_status: 'running', sync_error: null },
      actor: userActor(scope)
    });
    if (running.outcome === 'conflict') {
      return fail(409, { conflict: true });
    }

    const outcome =
      node.type === 'products'
        ? await syncProducts(scope.db, scope.orgId, scope.canvas.projectId, node)
        : await syncSocialFeed(scope.db, scope.orgId, scope.canvas.projectId, node);

    const patch = outcome.ok
      ? { sync_status: 'done', sync_error: null, synced_count: outcome.synced, synced_at: new Date().toISOString(), ...outcome.extra }
      : { sync_status: 'failed', sync_error: outcome.error };

    const written = await writeNodeData(scope.db, {
      orgId: scope.orgId,
      nodeId,
      expectedVersion: running.node.version,
      data: { ...running.node.data, ...patch },
      actor: userActor(scope)
    });
    if (written.outcome === 'conflict') {
      return fail(409, { conflict: true });
    }

    return { node: written.node };
  },

  /**
   * RIMETTERE IN VETRINA UN GIRI DI PRIMA. La storia non si tocca: è uno sguardo, non una
   * cancellazione — e il `refId` che resta è l'unica cosa che sopravvive a una ricarica.
   */
  restore: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const runId = String(fd.get('run_id') ?? '');
    if (!nodeId || !runId) {
      return fail(400, { error: 'richiesta non valida' });
    }

    const node = await findNode(scope.db, { orgId: scope.orgId, nodeId });
    if (!node || node.type !== 'text' && node.type !== 'image' && node.type !== 'video') {
      return fail(404, { error: 'nodo non trovato' });
    }

    const run = (await runsOf(scope.db, { orgId: scope.orgId, nodeId })).find((r) => r.id === runId);
    if (!run?.outputAssetId) {
      return fail(404, { error: 'generazione non trovata' });
    }

    const shown = await writeNodeData(scope.db, {
      orgId: scope.orgId,
      nodeId,
      expectedVersion: node.version,
      data: {
        ...node.data,
        refId: run.outputAssetId,
        runId: run.id,
        running: false,
        error: null
      },
      actor: userActor(scope)
    });
    if (shown.outcome === 'conflict') {
      return fail(409, { conflict: true });
    }
    return { node: shown.node };
  },

  create: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const type = String(fd.get('type') ?? '');
    const x = coord(fd.get('x'));
    const y = coord(fd.get('y'));
    if (!isNodeType(type) || x === null || y === null) {
      return fail(400, { error: 'nodo non valido' });
    }

    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(String(fd.get('data') ?? '{}')) as Record<string, unknown>;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return fail(400, { error: 'contenuto non valido' });
      }
    } catch {
      return fail(400, { error: 'contenuto non leggibile' });
    }

    // Un nodo trascinato dalla libreria degli asset o dai brand arriva con `data` già scritto
    // dal browser (`CanvasFlow::onCreateFilled`): non meno un input esterno di un form, e il
    // CHECK del database (`nodes_data_shape_check`) è l'ultima riga di difesa, non la prima —
    // rifiutarlo qui dà un errore leggibile invece di un 500 dal vincolo.
    const verdict = validateNodeData(type, data);
    if (!verdict.ok) {
      return fail(400, { error: verdict.error });
    }

    const node = await createNode(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      type,
      x,
      y,
      data: verdict.data,
      actor: userActor(scope)
    });

    return { node };
  },

  /**
   * UNA SCRITTURA PER GESTO, non per fotogramma: il client chiama qui quando il trascinamento
   * finisce. Il repository è last-write-wins apposta — due mani sullo stesso nodo si contendono
   * il puntatore, e nessuna delle due perde lavoro scritto.
   */
  move: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const x = coord(fd.get('x'));
    const y = coord(fd.get('y'));
    if (!nodeId || x === null || y === null) {
      return fail(400, { error: 'spostamento non valido' });
    }

    if (!(await listNodes(scope.db, scope)).some((node) => node.id === nodeId)) {
      return fail(404, { error: 'nodo non trovato' });
    }

    const node = await moveNode(scope.db, { orgId: scope.orgId, nodeId, x, y, actor: userActor(scope) });
    if (!node) {
      return fail(404, { error: 'nodo non trovato' });
    }

    return { moved: true };
  },

  /**
   * RIDIMENSIONARE: STESSA DOTTRINA DI `move` — last-write-wins, nessun `canvas_events` (il
   * commento in cima a `canvas.ts` lo dice esplicitamente), una scrittura sola a fine gesto, non
   * per fotogramma. Il minimo non è un numero a caso qui: è quello del TIPO del nodo
   * (`nodeSize`), lo stesso che decide la misura di un nodo appena creato — un nodo non può
   * restringersi sotto la taglia in cui nasce.
   */
  resize: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const width = coord(fd.get('width'));
    const height = coord(fd.get('height'));
    if (!nodeId || width === null || height === null) {
      return fail(400, { error: 'ridimensionamento non valido' });
    }

    const existing = (await listNodes(scope.db, scope)).find((node) => node.id === nodeId);
    if (!existing) {
      return fail(404, { error: 'nodo non trovato' });
    }

    const min = nodeSize(existing.type);
    await resizeNode(scope.db, {
      orgId: scope.orgId,
      nodeId,
      width: Math.max(min.w, width),
      height: Math.max(min.h, height)
    });

    return { resized: true };
  },

  /**
   * IL CONTENUTO PASSA DALLA VERSIONE, e zero righe è un conflitto e non un successo: chi chiama
   * lo sente come `conflict` e rilegge, invece di credere di aver scritto sopra qualcuno.
   */
  write: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const version = coord(fd.get('version'));
    if (!nodeId || version === null || !Number.isInteger(version) || version < 1) {
      return fail(400, { error: 'scrittura non valida' });
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(String(fd.get('data') ?? '{}')) as Record<string, unknown>;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return fail(400, { error: 'contenuto non valido' });
      }
    } catch {
      return fail(400, { error: 'contenuto non leggibile' });
    }

    if (!(await listNodes(scope.db, scope)).some((node) => node.id === nodeId)) {
      return fail(404, { error: 'nodo non trovato' });
    }

    const written = await writeNodeData(scope.db, {
      orgId: scope.orgId,
      nodeId,
      data,
      expectedVersion: version,
      actor: userActor(scope)
    });

    if (written.outcome === 'conflict') {
      return fail(409, { conflict: true });
    }

    return { node: written.node };
  },

  /**
   * SCRIVERE LO STESSO CAMPO SU PIÙ NODI — la barra della selezione, quando cambia modello,
   * formato, durata, audio o ripetizione su uno o più nodi scelti. UN CONFLITTO SU UN NODO NON
   * FERMA GLI ALTRI: sono N scritture indipendenti (ognuna con la propria `version` attesa, come
   * `write`), e riportare "conflict" per il nodo 3 mentre 1 e 2 sono andati a buon fine è più
   * onesto di un rifiuto in blocco che butterebbe via due scritture riuscite per colpa di una
   * terza.
   */
  batchWrite: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    let items: { node_id: string; version: number; patch: Record<string, unknown> }[];
    try {
      items = JSON.parse(String(fd.get('items') ?? '[]'));
      if (!Array.isArray(items) || !items.length) {
        return fail(400, { error: 'niente da scrivere' });
      }
    } catch {
      return fail(400, { error: 'contenuto non leggibile' });
    }

    const known = new Map((await listNodes(scope.db, scope)).map((node) => [node.id, node]));

    const results: { nodeId: string; outcome: 'written' | 'conflict' | 'not_found'; node?: CanvasNodeRecord }[] = [];
    for (const item of items) {
      const current = known.get(item.node_id);
      if (!current) {
        results.push({ nodeId: item.node_id, outcome: 'not_found' });
        continue;
      }

      const written = await writeNodeData(scope.db, {
        orgId: scope.orgId,
        nodeId: item.node_id,
        data: { ...current.data, ...item.patch },
        expectedVersion: item.version,
        actor: userActor(scope)
      });

      results.push(
        written.outcome === 'conflict'
          ? { nodeId: item.node_id, outcome: 'conflict' }
          : { nodeId: item.node_id, outcome: 'written', node: written.node }
      );
    }

    return { results };
  },

  /**
   * IL LINK PUBBLICO DI UN DOCUMENTO. Il token in chiaro esce qui e non torna più: resta solo
   * l'impronta, e «Nuovo link» ne conia un altro revocando quello di prima.
   */
  share: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const on = fd.get('on') === 'true';
    if (!nodeId) {
      return fail(400, { error: 'documento non valido' });
    }

    const node = (await listNodes(scope.db, scope)).find((row) => row.id === nodeId);
    if (!node || node.type !== 'doc') {
      return fail(404, { error: 'documento non trovato' });
    }

    const data = docData({
      id: node.id,
      content: typeof node.data.content === 'string' ? node.data.content : '',
      public: on
    });

    if (!on) {
      await clearDocShare(scope.db, { orgId: scope.orgId, nodeId, data });
      return { public: false };
    }

    const { token, token_hash } = await mintShareToken();
    await setDocShare(scope.db, {
      orgId: scope.orgId,
      nodeId,
      data,
      tokenHash: token_hash,
      expiresAt: null
    });

    return { public: true, path: `/d/${token}` };
  },

  connect: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const sourceNodeId = String(fd.get('source_node_id') ?? '');
    const targetNodeId = String(fd.get('target_node_id') ?? '');
    const kind = String(fd.get('kind') ?? '');
    const targetHandle = fd.get('target_handle');
    if (!sourceNodeId || !targetNodeId || !isCanvasEdgeKind(kind)) {
      return fail(400, { error: 'collegamento non valido' });
    }

    // Il verso viaggia sull'attacco: `nodes_connections` non ha una colonna `kind`, e perderlo
    // qui vorrebbe dire riaprire la tela con ogni linea tornata «nasce da».
    const nodeIds = new Set((await listNodes(scope.db, scope)).map((node) => node.id));
    if (sourceNodeId === targetNodeId || !nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) {
      return fail(400, { error: 'collegamento non valido' });
    }

    const connection = await createConnection(scope.db, {
      orgId: scope.orgId,
      canvasId: scope.canvasId,
      sourceNodeId,
      targetNodeId,
      sourceHandle: kind,
      // La porta tipizzata (`ConnectorType`) su cui questo arco atterra — assente per la maggior
      // parte dei gesti (l'attacco generico d'origine), presente quando chi collega SA già quale
      // porta vuole: "Collega a nuovo…"/"Collega a…" sulla selezione (`connect-selection-plan.ts`).
      targetHandle: typeof targetHandle === 'string' && targetHandle ? targetHandle : null,
      actor: userActor(scope)
    });

    return { connection };
  },

  disconnect: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const connectionId = String(fd.get('connection_id') ?? '');
    if (!connectionId) {
      return fail(400, { error: 'linea non valida' });
    }

    if (!(await listConnections(scope.db, scope)).some((edge) => edge.id === connectionId)) {
      return fail(404, { error: 'linea non trovata' });
    }
    await deleteConnection(scope.db, { orgId: scope.orgId, connectionId, actor: userActor(scope) });

    return { disconnected: true };
  },

  /**
   * FISSO O ITERATE — il toggle che rende un filo un asse di loop (`loop-axes.ts`), non una
   * connessione nuova: l'arco resta lo stesso, cambia solo come un nodo a valle lo legge.
   */
  set_edge_mode: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const connectionId = String(fd.get('connection_id') ?? '');
    const mode = String(fd.get('mode') ?? '');
    if (!connectionId || !isWireMode(mode)) {
      return fail(400, { error: 'modo non valido' });
    }

    const connection = await setConnectionMode(scope.db, { orgId: scope.orgId, connectionId, mode });
    if (!connection) {
      return fail(404, { error: 'linea non trovata' });
    }

    return { connection };
  },

  /**
   * CANCELLARE È MORBIDO, e le linee cadono con i nodi: `nodes_connections` non ha un cascade su
   * un `deleted_at`, quindi una linea verso un nodo sparito resterebbe nel database e tornerebbe
   * disegnata alla prossima apertura, puntando al vuoto.
   */
  remove: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeIds = String(fd.get('node_ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!nodeIds.length) {
      return fail(400, { error: 'niente da cancellare' });
    }

    const canvasNodes = new Set((await listNodes(scope.db, scope)).map((node) => node.id));
    if (nodeIds.some((id) => !canvasNodes.has(id))) {
      return fail(404, { error: 'nodo non trovato' });
    }
    const connectionIds = (await listConnections(scope.db, scope))
      .filter((edge) => nodeIds.includes(edge.sourceNodeId) || nodeIds.includes(edge.targetNodeId))
      .map((edge) => edge.id);

    for (const connectionId of connectionIds) {
      await deleteConnection(scope.db, { orgId: scope.orgId, connectionId, actor: userActor(scope) });
    }
    for (const nodeId of nodeIds) {
      await deleteNode(scope.db, { orgId: scope.orgId, nodeId, actor: userActor(scope) });
    }

    return { removed: true };
  },

  /**
   * ⌘D SULLA SELEZIONE, O ⌘V DI QUEL CHE ⌘C HA COPIATO: stessa scrittura, forme diverse di chi la
   * chiede — duplicare rilegge gli id dalla tela aperta, incollare porta già `type`/`data`/`x`/`y`
   * per ogni nodo (il client li ha letti dal proprio stato, magari da un'ALTRA tela della stessa
   * org) più le linee interne per indice. `duplicateNodes` fa la prima; questa azione fa anche la
   * seconda quando `nodes` arriva nel form — la stessa validazione di `create`, ripetuta per riga,
   * perché un payload che viaggia nella clipboard non è meno un input esterno di un form.
   */
  duplicate: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeIds = String(fd.get('node_ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!nodeIds.length) {
      return fail(400, { error: 'niente da duplicare' });
    }

    const out = await duplicateNodes(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      nodeIds,
      actor: userActor(scope)
    });

    return out;
  },

  paste: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    let pasted: { type: string; data: Record<string, unknown>; x: number; y: number }[];
    let edges: { sourceIndex: number; targetIndex: number; sourceHandle: string | null; targetHandle: string | null }[];
    try {
      pasted = JSON.parse(String(fd.get('nodes') ?? '[]'));
      edges = JSON.parse(String(fd.get('edges') ?? '[]'));
      if (!Array.isArray(pasted) || !Array.isArray(edges)) {
        return fail(400, { error: 'contenuto non valido' });
      }
    } catch {
      return fail(400, { error: 'contenuto non leggibile' });
    }
    if (!pasted.length) {
      return fail(400, { error: 'niente da incollare' });
    }

    const nodes: Awaited<ReturnType<typeof createNode>>[] = [];
    for (const p of pasted) {
      const verdict = validateNodeData(p.type, p.data);
      if (!verdict.ok) {
        return fail(400, { error: verdict.error });
      }

      const node = await createNode(scope.db, {
        orgId: scope.orgId,
        projectId: scope.canvas.projectId,
        canvasId: scope.canvasId,
        type: p.type,
        x: p.x,
        y: p.y,
        data: verdict.data,
        actor: userActor(scope)
      });
      nodes.push(node);
    }

    const connections: Awaited<ReturnType<typeof createConnection>>[] = [];
    for (const e of edges) {
      const source = nodes[e.sourceIndex];
      const target = nodes[e.targetIndex];
      if (!source || !target) {
        continue;
      }
      connections.push(
        await createConnection(scope.db, {
          orgId: scope.orgId,
          canvasId: scope.canvasId,
          sourceNodeId: source.id,
          targetNodeId: target.id,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          actor: userActor(scope)
        })
      );
    }

    return { nodes, connections };
  },

  /**
   * ⌘Z: ANNULLA UN GESTO, non un item — vedi `undo-plan.ts::checkGesture`. Il client manda gli
   * `UndoItem` del suo stack (uno per il gesto più uno per ogni `edge.delete` che un cambio di
   * modello ha portato con sé), e questa azione li applica con GLI STESSI repo di ogni scrittura
   * ordinaria: la stessa concorrenza ottimistica, lo stesso soft-delete, la stessa riga in
   * `canvas_events` attribuita a chi ha premuto Ctrl+Z.
   *
   * UN RIFIUTO NON È UN 500: `409` con una `reason` leggibile — un collega ha cambiato lo stesso
   * nodo nel frattempo, o l'ha già cancellato, o ci ha agganciato un arco che questo undo
   * cancellerebbe senza saperlo. Mai una scrittura silenziosa sopra il lavoro di un altro.
   */
  undo: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    let raw: unknown[];
    try {
      raw = JSON.parse(String(fd.get('items') ?? '[]'));
      if (!Array.isArray(raw) || !raw.length) {
        return fail(400, { error: 'niente da annullare' });
      }
    } catch {
      return fail(400, { error: 'contenuto non leggibile' });
    }

    const items = raw.map(parseUndoItem);
    if (items.some((item) => item === null)) {
      return fail(400, { error: 'gesto non valido' });
    }

    const gesture: Gesture = { items: items as UndoItem[] };
    const result = await undoGesture(scope.db, {
      orgId: scope.orgId,
      canvasId: scope.canvasId,
      gesture,
      actor: userActor(scope)
    });

    if (result.outcome === 'refused') {
      return fail(409, { reason: result.reason });
    }
    return { outcome: 'undone', redo: result.redo };
  },

  /**
   * SUGGERIMENTI DI PROSSIMO PASSO — la tabella (`next-step-actions.ts`) dice cosa ha senso per
   * il tipo del nodo selezionato, la frequenza storica (`next-step-stats.ts`) li ordina, e Jev
   * (se `TYPESAFE_API_KEY` è presente) può solo RI-ordinare lo stesso insieme validato — mai
   * aggiungere un'azione fuori da esso (`suggestNextSteps`, verificato lì).
   */
  suggestNextStep: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const nodeId = String(fd.get('node_id') ?? '');
    const node = (await listNodes(scope.db, scope)).find((n) => n.id === nodeId);
    if (!node) {
      return fail(404, { error: 'nodo non trovato' });
    }

    const frequency = await actionFrequencyFor(scope.db, scope.orgId, node.type);
    const decide = process.env.TYPESAFE_API_KEY ? decideWithJev : null;
    const suggestions = await suggestNextSteps(node.type, frequency, decide);

    return {
      suggestions: suggestions.map((s) => ({
        id: s.action.id,
        label: s.action.label,
        createsNodeType: s.action.createsNodeType,
        wiring: s.action.wiring,
        promptTemplate: s.action.promptTemplate,
        confidence: s.confidence
      }))
    };
  },

  /**
   * DALLA SELEZIONE DEL CANVAS A UN POST — la promozione, opzionalmente programmata. `node_ids`
   * arriva in ordine dalla UI (l'ordine con cui il composer li ha raccolti); questa action non
   * sceglie una caption, la riceve già scelta. `mode`: senza `scheduled_for` resta `draft`, con
   * un `scheduled_for` (e almeno un account) prova a consegnare via Zernio.
   */
  create_post: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();

    const brandId = String(fd.get('brand_id') ?? '');
    const caption = String(fd.get('caption') ?? '');
    const nodeIds = fd.getAll('node_id').map(String);
    const accountIds = fd.getAll('account_id').map(String);
    const scheduledFor = String(fd.get('scheduled_for') ?? '').trim();

    if (!brandId || !nodeIds.length) {
      return fail(400, { error: 'brand_and_nodes_required' });
    }

    const mode = scheduledFor ? ({ kind: 'schedule', at: scheduledFor } as const) : ({ kind: 'draft' } as const);

    const result = await createPostFromNodes(
      scope.db,
      {
        brands: { findBrand },
        accounts: { listBrandAccounts },
        promoteNodesToPost: (db, _repos, input) =>
          promoteNodesToPost(db, { canvas: { listNodesByIds }, posts: { promoteToPost } }, input),
        setPostStatus,
        scheduleDelivery
      },
      { orgId: scope.orgId, userId: scope.userId, brandId, nodeIds, caption, accountIds, mode },
      publisher
    );

    if (!result.ok) {
      return fail(result.error === 'node_not_found' ? 400 : 422, result);
    }
    return { post: result.post };
  }
};
