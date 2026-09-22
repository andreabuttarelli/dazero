import type { Db } from '$lib/server/db/client';
import type { GenMedium, GenParams } from '$lib/canvas/gen-node';
import { findAsset, insertAsset, type Asset } from '$lib/server/repos/assets';
import {
  claimRun,
  completeRun,
  createRun,
  dueRuns,
  expireRun,
  failRun,
  listNodeRuns,
  setExternalJob,
  type NodeRun
} from '$lib/server/repos/node-runs';
import { findNode, writeNodeData } from '$lib/server/repos/canvas';
import type { Actor } from '$lib/server/repos/actor';

/**
 * FAR GIRARE UN NODO DELLA TELA, SULLO SCHEMA NUOVO.
 *
 * Il giro è un `node_runs` con dentro il prompt e il modello COPIATI: il nodo cambia mentre si
 * guarda il risultato di ieri, e la storia deve raccontare con cosa è stato fatto davvero.
 * L'uscita atterra su `assets` — compreso il testo, che nel disegno di prima non aveva dove
 * depositarsi — e `output_asset_id` è il legame che sopravvive a una ricarica.
 *
 *   click  →  node_runs(running)  →  genera  →  assets  →  node_runs(done)
 *
 * Un clip non torna pronto: `external_job_id` resta sulla riga e il cron la riprende. Il claim
 * atomico è lì per quello — due tick sovrapposti pagherebbero due volte.
 */
const ONE_RENDER = 1;

export type StartRun = {
  orgId: string;
  projectId: string;
  canvasId: string;
  nodeId: string;
  userId: string;
  medium: GenMedium;
  prompt: string;
  model: string | null;
  params: GenParams;
  expectedVersion: number;
  /** Assente = il click di una persona. Un agente passa `kind: 'agent'` e la sua chiave. */
  actor?: Actor;
};

export type RunOutcome =
  | { kind: 'done'; run: NodeRun; asset: Asset }
  | { kind: 'queued'; run: NodeRun }
  | { kind: 'refused'; error: string }
  | { kind: 'conflict' };

function refuse(input: StartRun): string | null {
  if (!input.prompt.trim()) {
    return 'prompt_required';
  }
  if (!input.model) {
    return 'model_required';
  }
  return null;
}

async function depositText(db: Db, input: StartRun, text: string): Promise<Asset> {
  return insertAsset(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    type: 'text',
    source: 'generated',
    content: text,
    mimeType: 'text/plain',
    sourceNodeId: input.nodeId
  });
}

async function depositImage(db: Db, input: StartRun, media: { storage_path?: string; mime: string | null; width: number | null; height: number | null; bytes?: number }): Promise<Asset | null> {
  if (!media.storage_path) {
    return null;
  }

  return insertAsset(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    type: 'image',
    source: 'generated',
    url: media.storage_path,
    mimeType: media.mime,
    width: media.width,
    height: media.height,
    bytes: media.bytes ?? null,
    sourceNodeId: input.nodeId
  });
}

/**
 * Il giro compiuto entra in storia e prende la vetrina.
 *
 * PRIMA LA STORIA, POI LA VETRINA: se la seconda scrittura fallisce resta un giro registrato che
 * il nodo non mostra — recuperabile. Il contrario perderebbe il legame fra il nodo e quel che ha
 * fatto, che è la cosa che nessuna ricerca a mano in una libreria ricostruisce.
 */
async function land(db: Db, input: StartRun, version: number, run: NodeRun, asset: Asset, costUsd?: number | null): Promise<RunOutcome> {
  await completeRun(db, { orgId: input.orgId, runId: run.id, assetId: asset.id, costUsd });

  const shown = await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: input.nodeId,
    expectedVersion: version,
    actor: input.actor,
    data: {
      prompt: input.prompt,
      model: input.model,
      params: input.params,
      running: false,
      runId: run.id,
      refId: asset.id,
      error: null
    }
  });

  if (shown.outcome === 'conflict') {
    return { kind: 'conflict' };
  }
  return { kind: 'done', run: { ...run, status: 'done', outputAssetId: asset.id }, asset };
}

/**
 * Un giro che non atterra deve COMUNQUE abbassare `running`. Senza, il nodo resta in corso per
 * sempre e il bottone resta spento: il difetto che non si può più riprovare. `refId` di prima si
 * conserva — il risultato vecchio non sparisce perché il nuovo è fallito.
 */
async function giveUp(db: Db, input: StartRun, version: number, run: NodeRun, message: string): Promise<void> {
  await failRun(db, { orgId: input.orgId, runId: run.id, error: message }).catch(() => {});

  const prior = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId }).catch(() => null);
  await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: input.nodeId,
    expectedVersion: version,
    actor: input.actor,
    data: {
      ...(prior?.data ?? {}),
      prompt: input.prompt,
      model: input.model,
      params: input.params,
      running: false,
      runId: run.id,
      error: message
    }
  }).catch(() => {});
}

export async function runGenNode(db: Db, input: StartRun): Promise<RunOutcome> {
  const refused = refuse(input);
  if (refused) {
    return { kind: 'refused', error: refused };
  }

  const run = await createRun(db, {
    orgId: input.orgId,
    nodeId: input.nodeId,
    prompt: input.prompt,
    model: input.model,
    params: input.params,
    actorKind: input.actor?.kind ?? 'user',
    actorId: input.actor?.id ?? input.userId
  });

  const marked = await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: input.nodeId,
    expectedVersion: input.expectedVersion,
    actor: input.actor,
    data: {
      prompt: input.prompt,
      model: input.model,
      params: input.params,
      running: true,
      runId: run.id
    }
  });
  if (marked.outcome === 'conflict') {
    await failRun(db, { orgId: input.orgId, runId: run.id, error: 'conflict' }).catch(() => {});
    return { kind: 'conflict' };
  }
  const version = marked.node.version;

  try {
    if (input.medium === 'text') {
      const { llmText } = await import('$lib/server/llm');
      const out = await llmText({ prompt: input.prompt, model: input.model ?? undefined, label: 'canvas.text' });
      const asset = await depositText(db, input, out.text);
      return land(db, input, version, run, asset);
    }

    if (input.medium === 'image') {
      const { generateImagesWithoutBrand } = await import('$lib/server/media-generate');
      const out = await generateImagesWithoutBrand(db as never, {
        orgId: input.orgId,
        userId: input.userId,
        prompt: input.prompt,
        model: input.model ?? undefined,
        count: ONE_RENDER,
        aspectRatio: input.params.aspectRatio as never
      });
      if (!out.ok) {
        const message = 'reason' in out && out.reason ? `${out.error}: ${out.reason}` : out.error;
        await giveUp(db, input, version, run, message);
        return { kind: 'refused', error: message };
      }

      const generated = out.media[0];
      const asset = generated ? await depositImage(db, input, generated) : null;
      if (!asset) {
        const message = generated?.storage_path === undefined
          ? 'store_failed: the render carried no storage path to deposit'
          : 'store_failed';
        await giveUp(db, input, version, run, message);
        return { kind: 'refused', error: message };
      }
      return land(db, input, version, run, asset);
    }

    const { generateVideoWithoutBrand } = await import('$lib/server/media-generate');
    const out = await generateVideoWithoutBrand({
      orgId: input.orgId,
      userId: input.userId,
      prompt: input.prompt,
      model: input.model ?? undefined,
      aspectRatio: input.params.aspectRatio as never,
      durationSeconds: input.params.duration
    });
    if (!out.ok) {
      await giveUp(db, input, version, run, out.error);
      return { kind: 'refused', error: out.error };
    }

    await setExternalJob(db, { orgId: input.orgId, runId: run.id, externalJobId: out.jobId });
    return { kind: 'queued', run: { ...run, externalJobId: out.jobId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'render_failed';
    await giveUp(db, input, version, run, message);
    return { kind: 'refused', error: message };
  }
}

export type RunWithText = NodeRun & { text: string | null };

/**
 * La storia di un nodo, dal più vecchio: la striscia sotto il risultato.
 *
 * Il testo generato viaggia CON il giro — un'immagine non ha nulla da portare, un sì. Senza,
 * il riquadro di un testo mostrerebbe un'icona e basta.
 */
export async function runsOf(db: Db, scope: { orgId: string; nodeId: string }): Promise<RunWithText[]> {
  const runs = await listNodeRuns(db, scope);
  const out: RunWithText[] = [];

  for (const run of runs) {
    let text: string | null = null;
    if (run.outputAssetId) {
      const asset = await findAsset(db, { orgId: scope.orgId, assetId: run.outputAssetId });
      text = asset?.content ?? null;
    }
    out.push({ ...run, text });
  }
  return out;
}

export { claimRun, completeRun, failRun };

/**
 * QUANTO PUÒ RESTARE `running` UN GIRO PRIMA CHE SIA UN GIRO PERSO, non un giro lento.
 *
 * Un'immagine è sincrona — la funzione che la genera muore con la richiesta HTTP che la porta —
 * quindi non esiste, per lei, un cron che aspetta un provider. Se quella richiesta muore a metà
 * (il deploy, il timeout della piattaforma, la scheda chiusa dal browser) `node_runs` resta
 * `running` e nessuno lo saprà mai: né un secondo click, spento dal bottone, né una ricarica, che
 * rilegge la stessa riga ferma.
 *
 * La soglia sta sopra il `maxDuration` della rotta che genera (300s): sotto, questo giro
 * dichiarerebbe perso un giro che sta ancora lavorando dentro il suo tempo lecito.
 */
export const RUN_STALE_MS = 6 * 60_000;

export type ExpireOutcome = { expired: number };

const RUN_TIMED_OUT = 'timed out — the request that ran it never came back';

/**
 * UN GIRO SENZA VIA D'USCITA VIENE CHIUSO A MANO, DA FUORI.
 *
 * `claimRun` prima di ogni scrittura: due tick sovrapposti — o questo tick e la richiesta
 * originale che in realtà sta ancora rispondendo — non devono chiudere la stessa riga due volte.
 * Zero righe dal claim vuol dire che è già stata presa, e si passa oltre senza toccare nulla.
 *
 * Il nodo torna a `running: false` con l'errore scritto: senza, la riga in `node_runs` direbbe la
 * verità e lo schermo continuerebbe a mentire — esattamente il difetto segnalato.
 */
export async function expireStuckRuns(db: Db): Promise<ExpireOutcome> {
  const before = new Date(Date.now() - RUN_STALE_MS).toISOString();
  const stuck = await dueRuns(db, { before });

  let expired = 0;
  for (const run of stuck) {
    const claimed = await claimRun(db, { orgId: run.orgId, runId: run.id });
    if (!claimed) continue;

    await expireRun(db, { orgId: run.orgId, runId: run.id, error: RUN_TIMED_OUT });

    const node = await findNode(db, { orgId: run.orgId, nodeId: run.nodeId }).catch(() => null);
    if (node) {
      await writeNodeData(db, {
        orgId: run.orgId,
        nodeId: run.nodeId,
        expectedVersion: node.version,
        data: { ...node.data, running: false, runId: run.id, error: RUN_TIMED_OUT }
      }).catch(() => {});
    }

    expired += 1;
  }

  return { expired };
}
