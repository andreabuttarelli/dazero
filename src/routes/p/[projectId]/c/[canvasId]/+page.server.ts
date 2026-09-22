import { uploadCanvasAsset, UploadError } from '$lib/server/canvas/upload';
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
  writeNodeData
} from '$lib/server/repos/canvas';
import { isNodeType, docData } from '$lib/canvas-node-data';
import { mintShareToken } from '$lib/canvas/doc-node';
import { clearDocShare, setDocShare } from '$lib/server/repos/doc-share';
import { isCanvasEdgeKind } from '$lib/canvas-edges';
import { canvasModelCatalogue } from '$lib/server/canvas-catalogue';
import { runGenNode, runsOf } from '$lib/server/canvas/generate';
import { gateOrgAiAction } from '$lib/server/cli-auth';

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
  scope: { orgId: string; canvasId: string }
): Promise<Record<string, unknown[]>> {
  const nodes = await listNodes(db, scope);
  const runs: Record<string, unknown[]> = {};
  for (const node of nodes) {
    runs[node.id] = await runsOf(db, { orgId: scope.orgId, nodeId: node.id });
  }
  return runs;
}

export const load: PageServerLoad = async ({ params, locals }) => {
  const { db, orgId, canvasId, canvas } = await scopeFor(locals, params.canvasId);

  const [nodes, connections, catalogue] = await Promise.all([
    listNodes(db, { orgId, canvasId }),
    listConnections(db, { orgId, canvasId }),
    canvasModelCatalogue()
  ]);

  const runs = await loadGenRuns(db, { orgId, canvasId });

  return { canvas, nodes, connections, catalogue, runs, projectId: params.projectId };
};

/** Un numero che arriva da un form: finito, o la riga nasce con `NaN` dentro una colonna numerica. */
function coord(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const actions: Actions = {
  upload: async ({ request, params, locals }) => {
    const scope = await scopeFor(locals, params.canvasId);
    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) { return fail(400, { error: 'Scegli un file' }); }
    try {
      return await uploadCanvasAsset(scope.db, {
        orgId: scope.orgId, projectId: scope.canvas.projectId, canvasId: scope.canvasId,
        userId: scope.userId, file, x: coord(fd.get('x')) ?? 0, y: coord(fd.get('y')) ?? 0
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
    const runs = await loadGenRuns(scope.db, { orgId: scope.orgId, canvasId: scope.canvasId });
    return { nodes, connections, runs };
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

    const denied = await gateOrgAiAction(scope.orgId, undefined);
    if (denied) {
      return denied;
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
      }
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

    const node = await createNode(scope.db, {
      orgId: scope.orgId,
      projectId: scope.canvas.projectId,
      canvasId: scope.canvasId,
      type,
      x,
      y,
      data
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

    const node = await moveNode(scope.db, { orgId: scope.orgId, nodeId, x, y });
    if (!node) {
      return fail(404, { error: 'nodo non trovato' });
    }

    return { moved: true };
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
      expectedVersion: version
    });

    if (written.outcome === 'conflict') {
      return fail(409, { conflict: true });
    }

    return { node: written.node };
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
      sourceHandle: kind
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
    await deleteConnection(scope.db, { orgId: scope.orgId, connectionId });

    return { disconnected: true };
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
      await deleteConnection(scope.db, { orgId: scope.orgId, connectionId });
    }
    for (const nodeId of nodeIds) {
      await deleteNode(scope.db, { orgId: scope.orgId, nodeId });
    }

    return { removed: true };
  }
};
