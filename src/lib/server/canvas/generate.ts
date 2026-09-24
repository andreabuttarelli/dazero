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
  queuedVideoRuns,
  releaseClaim,
  retryClaim,
  setExternalJob,
  type NodeRun
} from '$lib/server/repos/node-runs';
import { findNode, writeNodeData } from '$lib/server/repos/canvas';
import type { Actor } from '$lib/server/repos/actor';
import { signMediaPaths } from './sign-media';

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

/**
 * IL MODELLO SI SCEGLIE PRIMA DI SPENDERE UNA LETTURA — l'unica cosa che questo giro sa senza
 * aver ancora chiesto alla tela. IL PROMPT NO: un nodo senza prompt proprio ma wired a un testo
 * a monte con qualcosa scritto è comunque pronto a girare (CLAUDE.md — "un testo a monte conta
 * come prompt"), e questo si scopre solo dopo aver letto l'upstream (`upstream.ts`), non prima.
 * Rifiutare qui su `input.prompt` da solo era il difetto: un'immagine wired a un testo restava
 * spenta perché questa funzione non sapeva ancora che a monte c'era qualcosa da dire.
 */
function refuse(input: StartRun): string | null {
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

async function depositVideo(
  db: Db,
  scope: { orgId: string; projectId: string; nodeId: string },
  media: { url: string; durationSeconds: number | null }
): Promise<Asset> {
  return insertAsset(db, {
    orgId: scope.orgId,
    projectId: scope.projectId,
    type: 'video',
    source: 'generated',
    url: media.url,
    mimeType: 'video/mp4',
    durationS: media.durationSeconds,
    sourceNodeId: scope.nodeId
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

  const shown = await writeNodeDataRetrying(db, input, version, (prior) => ({
    ...prior,
    running: false,
    runId: run.id,
    refId: asset.id,
    error: null
  }));

  if (!shown) {
    return { kind: 'conflict' };
  }
  return { kind: 'done', run: { ...run, status: 'done', outputAssetId: asset.id }, asset };
}

/**
 * Un giro che non atterra deve COMUNQUE abbassare `running`. Senza, il nodo resta in corso per
 * sempre e il bottone resta spento: il difetto che non si può più riprovare. `refId` di prima si
 * conserva — il risultato vecchio non sparisce perché il nuovo è fallito.
 *
 * QUESTA SCRITTURA NON PUÒ ESSERE PERSA A UN CONFLITTO DI VERSIONE. `writeNodeData` con
 * `expectedVersion` è la guardia giusta per il CONTENUTO — un secondo autore non deve sovrascrivere
 * il primo senza saperlo — ma una chiusura di errore non è contenuto: è il solo fatto che rimette
 * il nodo in condizione di essere riprovato. Un'altra scrittura arrivata nel mezzo (il trascinamento,
 * un altro campo) alza la versione, la guardia rifiuta scrivendo zero righe, e senza un ritentativo
 * quello zero passava per un successo silenzioso — il nodo restava `running:true` per sempre, il
 * difetto che questo commento sostituisce. Il ritentativo rilegge la versione VERA e ci scrive
 * sopra: un tetto di tentativi, non un ciclo infinito, perché un nodo cancellato nel mezzo non deve
 * far girare questa funzione all'infinito.
 */
const GIVE_UP_MAX_ATTEMPTS = 5;

/**
 * Riscrive `nodes.data` rileggendo la versione VERA a ogni conflitto, fino a un tetto di
 * tentativi. Condivisa da `giveUp` (chiusura d'errore) e dal riconciliatore video (chiusura di
 * successo arrivata da un cron, dove non c'è più una richiesta HTTP viva che possa riprovare da
 * sola): in entrambi i casi un conflitto perso lascerebbe il nodo `running:true` per sempre.
 */
async function writeNodeDataRetrying(
  db: Db,
  input: { orgId: string; nodeId: string; actor?: Actor },
  version: number,
  patch: (prior: Record<string, unknown>) => Record<string, unknown>
): Promise<boolean> {
  let attemptVersion = version;
  for (let attempt = 0; attempt < GIVE_UP_MAX_ATTEMPTS; attempt++) {
    const prior = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId }).catch(() => null);
    if (!prior) {
      return false;
    }

    const written = await writeNodeData(db, {
      orgId: input.orgId,
      nodeId: input.nodeId,
      expectedVersion: attemptVersion,
      actor: input.actor,
      data: patch(prior.data as Record<string, unknown>)
    }).catch(() => null);

    if (written?.outcome === 'written') {
      return true;
    }

    attemptVersion = prior.version;
  }
  return false;
}

async function giveUp(db: Db, input: StartRun, version: number, run: NodeRun, message: string): Promise<void> {
  await failRun(db, { orgId: input.orgId, runId: run.id, error: message }).catch(() => {});

  await writeNodeDataRetrying(db, input, version, (prior) => ({
    ...prior,
    prompt: input.prompt,
    model: input.model,
    params: input.params,
    running: false,
    runId: run.id,
    error: message
  }));
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

  const priorNode = await findNode(db, { orgId: input.orgId, nodeId: input.nodeId });

  // `...priorNode.data` prima delle chiavi nuove: senza, il `refId` di un giro riuscito prima
  // sparisce nell'istante in cui `running` si accende, e se il giro nuovo fallisce non c'è più un
  // `prior` che lo riporti indietro — l'immagine buona è persa per un giro che non ha prodotto
  // niente.
  const marked = await writeNodeData(db, {
    orgId: input.orgId,
    nodeId: input.nodeId,
    expectedVersion: input.expectedVersion,
    actor: input.actor,
    data: {
      ...priorNode?.data,
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

  // QUEL CHE LA TELA COLLEGA, DENTRO QUEL CHE SI MANDA AL MODELLO. Una lettura sola, prima dei tre
  // rami: `upstream-inputs.ts` è pura logica testata da sé (`upstream-inputs.test.ts`), e questa è
  // l'unica riga che la fa parlare col database di questo giro — vedi `upstream.ts`.
  const { upstreamInputsFor } = await import('$lib/server/canvas/upstream');
  const upstream = await upstreamInputsFor(db, {
    orgId: input.orgId,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    model: input.model,
    medium: input.medium
  });

  // UN MODELLO SPARITO DA `ai_models` FERMA IL GIRO PRIMA DI SPENDERE — mai dopo aver chiesto al
  // provider, che lo scoprirebbe comunque pagando la latenza. `giveUp` è la chiusura giusta: il
  // `refId` del giro precedente resta, solo `running`/`error` cambiano — il nodo mostra l'alert,
  // non perde il suo ultimo risultato.
  if (upstream.blocked) {
    await giveUp(db, input, version, run, upstream.blocked);
    return { kind: 'refused', error: upstream.blocked };
  }

  const prompt = [...upstream.text, input.prompt].filter((t) => t.trim()).join('\n\n');

  // NÉ IL PROPRIO PROMPT NÉ UN TESTO A MONTE: solo ORA si sa che non c'è niente da mandare al
  // modello — prima di questa riga `upstream.text` non era ancora stato letto. Il messaggio è
  // lo stesso che il client mostra (`gen-history.ts::BLOCKED`, "Scrivi cosa vuoi"), la stessa
  // regola in un posto solo, non due verità che possono divergere.
  if (!prompt.trim()) {
    await giveUp(db, input, version, run, 'prompt_required');
    return { kind: 'refused', error: 'prompt_required' };
  }

  try {
    if (input.medium === 'text') {
      const { llmText } = await import('$lib/server/llm');
      const { withOrgContext, billedUsdInScope } = await import('$lib/server/ai-log');
      const [imageUrls, videoUrls, audioUrls] = await Promise.all([
        signMediaPaths(db, upstream.referenceImageUrls),
        signMediaPaths(db, upstream.referenceVideoUrls),
        signMediaPaths(db, upstream.referenceAudioUrls)
      ]);
      const { text, costUsd } = await withOrgContext(input.orgId, async () => {
        const result = await llmText({
          prompt,
          model: input.model ?? undefined,
          label: 'canvas.text',
          upstream: { imageUrls, videoUrls, audioUrls }
        });
        return { text: result.text, costUsd: billedUsdInScope() ?? null };
      });
      const asset = await depositText(db, input, text);
      return land(db, input, version, run, asset, costUsd);
    }

    if (input.medium === 'image') {
      const { generateImagesWithoutBrand } = await import('$lib/server/media-generate');
      const out = await generateImagesWithoutBrand(db as never, {
        orgId: input.orgId,
        userId: input.userId,
        prompt,
        model: input.model ?? undefined,
        count: ONE_RENDER,
        aspectRatio: input.params.aspectRatio as never,
        // Un solo riferimento: `ImageJob.baseMediaId` è un campo, non una lista — anche quando il
        // modello ne accetterebbe di più (`upstream.referenceImageUrls`, dal catalogo in
        // `graph.ts`). Il tetto vero sta lì; qui si spedisce solo quel che il trasporto sa portare.
        baseMediaId: upstream.referenceImageUrl ?? undefined
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
      return land(db, input, version, run, asset, out.costUsd);
    }

    const { generateVideoWithoutBrand } = await import('$lib/server/media-generate');
    const [referenceImageUrls, referenceVideoUrls, referenceAudioUrls, lastFrame] = await Promise.all([
      signMediaPaths(db, upstream.referenceImageUrls),
      signMediaPaths(db, upstream.referenceVideoUrls),
      signMediaPaths(db, upstream.referenceAudioUrls),
      signMediaPaths(db, upstream.endFrameUrl ? [upstream.endFrameUrl] : [])
    ]);
    const out = await generateVideoWithoutBrand({
      orgId: input.orgId,
      userId: input.userId,
      prompt,
      model: input.model ?? undefined,
      aspectRatio: input.params.aspectRatio as never,
      durationSeconds: input.params.duration,
      baseMediaId: upstream.startFrameUrl ?? undefined,
      lastFrameUrl: lastFrame[0],
      referenceImageUrls,
      referenceVideoUrls,
      referenceAudioUrls
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

/**
 * RIPORTARE UN VIDEO IN CODA A `done`/`failed`: L'UNICA COSA CHE `runGenNode` NON FA DA SOLA.
 *
 * `runGenNode` per un video torna `queued` e ferma lì — il rendering vive dal fornitore, minuti
 * dopo la richiesta HTTP che l'ha chiesto. `submitAndTrackVideoRender` (dentro
 * `generateVideoWithoutBrand`) ha già scritto la STESSA sottomissione due volte: su `node_runs`
 * (qui, come `external_job_id`) e su `video_renders` (`task_id`, con tutto quel che serve a
 * finirla — risoluzione, opzioni di montaggio, quando è partita). Questa funzione non inventa un
 * secondo trasporto: legge quella riga per il task id e riusa `finishVideoRender`, lo stesso
 * motore che il riconciliatore dei brand usa già per `video_renders`.
 *
 *   node_runs(running, external_job_id) ──┐
 *                                          ├─→ video_renders(task_id) ──→ finishVideoRender
 *   depositVideo → assets ←────────────────┘                                    │
 *          │                                                          pending/done/failed
 *          └───────────────── writeNodeDataRetrying / giveUp ←────────────────┘
 *
 * IL CLAIM (`claimRun` → `finishing`) VIENE PRIMA DI TUTTO — stesso motivo di `video-render-queue.ts`:
 * due tick sovrapposti non devono scaricare e fatturare la stessa clip due volte. Un «non è ancora
 * pronta» rilascia il claim SENZA toccare `attempts` — quasi ogni claim è proprio questo, e
 * contarlo trasformerebbe il tetto dei tentativi in una scadenza di pochi minuti, esattamente
 * l'errore che il commento in cima a `video-render-queue.ts` documenta già.
 */
const VIDEO_RECONCILE_LIMIT = 20;
const VIDEO_RUN_MAX_ATTEMPTS = 8;

type VideoRenderLookup = {
  id: string;
  task_id: string;
  model: string;
  prompt: string | null;
  duration_seconds: number | null;
  resolution: string | null;
  cover_url: string | null;
  persist_opts: unknown;
  submitted_at: string;
};

/**
 * `video_renders` non è nello schema tipizzato di `Db` — vive nella parte del database che
 * `finishVideoRender` interroga già passando un `SupabaseClient` non ristretto. Stesso confine
 * qui: il cast dichiara che questa singola query esce dal narrowing, non lo aggira altrove.
 */
async function findVideoRenderRow(db: Db, renderId: string): Promise<VideoRenderLookup | null> {
  const { data, error } = await (db as unknown as { from(table: string): any })
    .from('video_renders')
    .select('id, task_id, model, prompt, duration_seconds, resolution, cover_url, persist_opts, submitted_at')
    .eq('id', renderId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return (data as VideoRenderLookup | null) ?? null;
}

function toStartRunShape(run: NodeRun): StartRun {
  return {
    orgId: run.orgId,
    projectId: '',
    canvasId: '',
    nodeId: run.nodeId,
    userId: run.actorId ?? '',
    medium: 'video',
    prompt: run.prompt ?? '',
    model: run.model,
    params: (run.params ?? {}) as GenParams
  } as StartRun;
}

export type VideoReconcileOutcome = { checked: number; done: number; failed: number; pending: number };

export async function reconcileVideoNodeRuns(db: Db): Promise<VideoReconcileOutcome> {
  const { rowToSubmitted } = await import('$lib/server/video-render-queue');
  const { finishVideoRender } = await import('$lib/server/video');
  const { withOrgContext, billedUsdInScope } = await import('$lib/server/ai-log');

  const queued = await queuedVideoRuns(db, { limit: VIDEO_RECONCILE_LIMIT });

  let checked = 0;
  let done = 0;
  let failed = 0;
  let pending = 0;

  for (const run of queued) {
    if (!run.externalJobId) continue;

    const claimed = await claimRun(db, { orgId: run.orgId, runId: run.id });
    if (!claimed) continue;
    checked += 1;

    const node = await findNode(db, { orgId: run.orgId, nodeId: run.nodeId }).catch(() => null);
    if (!node) {
      // Il nodo non c'è più: chiudere comunque il giro, non c'è dato nessuno da svegliare.
      await failRun(db, { orgId: run.orgId, runId: run.id, error: 'node_deleted' }).catch(() => {});
      failed += 1;
      continue;
    }

    const startRunShape: StartRun = { ...toStartRunShape(run), projectId: node.projectId, canvasId: node.canvasId };

    try {
      const row = await findVideoRenderRow(db, run.externalJobId);
      if (!row) {
        await giveUp(db, startRunShape, node.version, { ...run, status: 'finishing' }, 'video_render_row_missing');
        failed += 1;
        continue;
      }

      const submitted = rowToSubmitted({
        id: row.id,
        brand_id: null,
        org_id: run.orgId,
        user_id: startRunShape.userId,
        post_id: null,
        thread_id: null,
        task_id: row.task_id,
        model: row.model,
        status: 'rendering',
        duration_seconds: row.duration_seconds,
        resolution: row.resolution,
        cover_url: row.cover_url,
        prompt: row.prompt,
        persist_opts: row.persist_opts as never,
        submitted_at: row.submitted_at,
        attempts: run.attempts,
        error: null
      });

      const outcome = await withOrgContext(run.orgId, () =>
        finishVideoRender(db as never, startRunShape.userId, submitted)
      );

      if (outcome.status === 'pending') {
        await releaseClaim(db, { orgId: run.orgId, runId: run.id });
        pending += 1;
        continue;
      }

      if (outcome.status === 'failed') {
        const exhausted = run.attempts + 1 >= VIDEO_RUN_MAX_ATTEMPTS;
        if (!exhausted) {
          await retryClaim(db, { orgId: run.orgId, runId: run.id, attempts: run.attempts + 1, error: outcome.error });
          pending += 1;
          continue;
        }
        await giveUp(db, startRunShape, node.version, { ...run, status: 'finishing' }, outcome.error);
        failed += 1;
        continue;
      }

      const costUsd = billedUsdInScope() ?? null;
      const asset = await depositVideo(
        db,
        { orgId: run.orgId, projectId: node.projectId, nodeId: run.nodeId },
        { url: outcome.url, durationSeconds: outcome.durationSeconds }
      );
      await completeRun(db, { orgId: run.orgId, runId: run.id, assetId: asset.id, costUsd });
      await writeNodeDataRetrying(db, startRunShape, node.version, (prior) => ({
        ...prior,
        prompt: startRunShape.prompt,
        model: startRunShape.model,
        params: startRunShape.params,
        running: false,
        runId: run.id,
        refId: asset.id,
        error: null
      }));
      done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'video_reconcile_failed';
      const exhausted = run.attempts + 1 >= VIDEO_RUN_MAX_ATTEMPTS;
      if (!exhausted) {
        await retryClaim(db, { orgId: run.orgId, runId: run.id, attempts: run.attempts + 1, error: message }).catch(() => {});
        pending += 1;
        continue;
      }
      await giveUp(db, startRunShape, node.version, { ...run, status: 'finishing' }, message);
      failed += 1;
    }
  }

  return { checked, done, failed, pending };
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
  return Promise.all(runs.map(async (run) => ({ ...run, text: await outputText(db, scope.orgId, run.outputAssetId) })));
}

async function outputText(db: Db, orgId: string, assetId: string | null): Promise<string | null> {
  if (!assetId) {
    return null;
  }
  const asset = await findAsset(db, { orgId, assetId });
  return asset?.content ?? null;
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
 * UN BIGLIETTO DI LOOP (`loop.ts::enqueueLoop`, `node_runs.params.loop.phase === 'queued'`) NON È
 * PERSO PER LA SOLA ETÀ — è in attesa che `drainLoopQueue` lo reclami, e una coda lunga (fino a
 * 1000 combinazioni, drenate poche per tick) supera comodamente `RUN_STALE_MS`. Scambiarlo per un
 * giro perso lo chiuderebbe `expired` mentre aspettava solo il suo turno: il loop perderebbe
 * combinazioni non ancora partite, non solo quelle davvero bloccate. Un biglietto RECLAMATO
 * (`status: 'finishing'`) non passa comunque da questa funzione — `dueRuns` guarda solo
 * `status = 'running'` — quindi qui basta riconoscere la forma del biglietto ancora in coda.
 */
function isQueuedLoopTicket(run: { params: Record<string, unknown> }): boolean {
  const loop = run.params.loop;
  return Boolean(loop && typeof loop === 'object' && (loop as { phase?: unknown }).phase === 'queued');
}

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
  const stuck = (await dueRuns(db, { before })).filter((run) => !isQueuedLoopTicket(run));

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
