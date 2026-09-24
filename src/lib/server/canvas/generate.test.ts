import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';
import type { Db } from '$lib/server/db/client';
import { expireStuckRuns, reconcileVideoNodeRuns, runGenNode, RUN_STALE_MS } from './generate';

const ORG = '11111111-1111-1111-1111-111111111111';
const NODE = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const PROJECT = '44444444-4444-4444-4444-444444444444';
const USER = '55555555-5555-5555-5555-555555555555';
const CANVAS = '66666666-6666-6666-6666-666666666666';

const staleStartedAt = new Date(Date.now() - RUN_STALE_MS - 60_000).toISOString();

const runRow = {
  id: RUN,
  org_id: ORG,
  node_id: NODE,
  prompt: 'a cat',
  model: 'openai/gpt',
  params: { aspectRatio: '1:1' },
  status: 'running',
  error: null,
  output_asset_id: null,
  external_job_id: null,
  cost_usd: null,
  attempts: 0,
  claimed_at: null,
  started_at: staleStartedAt,
  finished_at: null,
  actor_kind: 'user',
  actor_id: null
};

const nodeRow = {
  id: NODE,
  org_id: ORG,
  project_id: 'project',
  canvas_id: 'canvas',
  type: 'image',
  data: { prompt: 'a cat', model: 'openai/gpt', params: {}, running: true, runId: RUN },
  position_x: 0,
  position_y: 0,
  width: null,
  height: null,
  version: 2,
  deleted_at: null,
  created_by: null,
  updated_by: null
};

const freshNodeRow = {
  id: NODE,
  org_id: ORG,
  project_id: PROJECT,
  canvas_id: CANVAS,
  type: 'image',
  display_name: null,
  x: 0,
  y: 0,
  z: 0,
  width: null,
  height: null,
  data: {},
  version: 1
};

const { generateImagesWithoutBrand, generateVideoWithoutBrand } = vi.hoisted(() => ({
  generateImagesWithoutBrand: vi.fn(),
  generateVideoWithoutBrand: vi.fn()
}));
vi.mock('$lib/server/media-generate', () => ({ generateImagesWithoutBrand, generateVideoWithoutBrand }));

const { llmText } = vi.hoisted(() => ({ llmText: vi.fn() }));
vi.mock('$lib/server/llm', () => ({ llmText }));

const { finishVideoRender } = vi.hoisted(() => ({ finishVideoRender: vi.fn() }));
vi.mock('$lib/server/video', () => ({ finishVideoRender }));

// `upstreamInputsFor` chiede sempre le modalità del modello quando il nodo ne ha uno: senza
// questo mock il test colpirebbe il vero gateway (assente in test) e il modello risulterebbe
// "sparito", bloccando ogni giro per una ragione estranea al test.
const { modalitiesOf } = vi.hoisted(() => ({ modalitiesOf: vi.fn() }));
vi.mock('$lib/server/ai-models-sync', () => ({ modalitiesOf }));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => ({}) }));

const SYNCED_MODALITIES = { input: ['text', 'image'], output: ['image'], synced_at: 'now' };

// Il default per OGNI test: un modello sincronizzato. Un solo describe (quello sul modello
// sparito) lo sovrascrive nel proprio `beforeEach`, e resta locale a quel blocco — Vitest
// esegue i `beforeEach` dal più esterno al più interno, quindi quello locale vince sempre per
// ultimo.
beforeEach(() => {
  modalitiesOf.mockReset();
  modalitiesOf.mockResolvedValue(SYNCED_MODALITIES);
});

/**
 * IL DIFETTO VERO: `store_failed` senza dire perché.
 *
 * Il modello RISPONDE — `generateImagesWithoutBrand` torna `ok:false` con una `reason` presa dal
 * bucket che rifiuta la scrittura — ma prima di questa correzione `runGenNode` schiacciava tutto
 * su `store_failed`, un token che non dice se manca un bucket, se la scrittura è stata respinta o
 * se il campo che porta il percorso è semplicemente assente. L'utente vedeva un nodo spento e
 * nessun modo di capire perché.
 */
describe('un giro immagine che fallisce a depositare dice IL MOTIVO, non un token muto', () => {
  beforeEach(() => {
    generateImagesWithoutBrand.mockReset();
  });

  it('porta la reason del fornitore di storage nell\'errore del nodo', async () => {
    generateImagesWithoutBrand.mockResolvedValue({
      ok: false,
      error: 'store_failed',
      reason: 'Bucket not found'
    });

    const { db, calls } = fakeDb(
      { nodes: [freshNodeRow] },
      { updateRows: { nodes: [{ ...freshNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: 'a cat wearing a hat',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result).toMatchObject({ kind: 'refused', error: expect.stringContaining('Bucket not found') });

    const nodeUpdates = calls.filter((c) => c.table === 'nodes' && c.op === 'update');
    const lastUpdate = nodeUpdates[nodeUpdates.length - 1];
    expect((lastUpdate?.payload as { data?: { error?: string } })?.data?.error).toContain('Bucket not found');
    expect((lastUpdate?.payload as { data?: { error?: string } })?.data?.error).not.toBe('store_failed');
  });
});

/**
 * UN NODO SENZA PROMPT PROPRIO MA WIRED A UN TESTO GIRA LO STESSO — il difetto segnalato: `refuse`
 * guardava solo `input.prompt`, PRIMA di leggere l'upstream, e un'immagine senza prompt suo ma
 * collegata a un nodo testo con qualcosa scritto veniva rifiutata come se non avesse niente da
 * mandare al modello. Il testo a monte conta come prompt (CLAUDE.md), con la STESSA composizione
 * che `upstream.ts`/`generate.ts` già fanno per il giro vero: `[...upstream.text, input.prompt]`.
 */
describe('un nodo senza prompt proprio ma con un testo a monte collegato gira lo stesso', () => {
  const TEXT_NODE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    generateImagesWithoutBrand.mockReset();
    generateImagesWithoutBrand.mockResolvedValue({
      ok: true,
      media: [{ storage_path: 'u/media/generated.png', mime: 'image/png', width: 1024, height: 1024 }],
      costUsd: 0.02
    });
  });

  it('chiama il render con il testo a monte come prompt, non rifiuta prompt_required', async () => {
    const { db } = fakeDb(
      {
        nodes: [
          freshNodeRow,
          { ...freshNodeRow, id: TEXT_NODE, type: 'text', data: { prompt: 'a cat wearing a hat' } }
        ],
        nodes_connections: [
          {
            id: 'e1',
            canvas_id: CANVAS,
            source_node_id: TEXT_NODE,
            target_node_id: NODE,
            source_handle: null,
            target_handle: null
          }
        ],
        assets: []
      },
      { updateRows: { nodes: [{ ...freshNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: '',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result.kind).toBe('done');
    expect(generateImagesWithoutBrand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: 'a cat wearing a hat' })
    );
  });

  it('senza prompt proprio e senza niente a monte, rifiuta prompt_required — dopo aver letto l\'upstream, non prima', async () => {
    const { db } = fakeDb(
      { nodes: [freshNodeRow], nodes_connections: [], assets: [] },
      { updateRows: { nodes: [{ ...freshNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: '',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result).toMatchObject({ kind: 'refused', error: 'prompt_required' });
    expect(generateImagesWithoutBrand).not.toHaveBeenCalled();
  });

  it('un video senza prompt proprio ma wired a un testo gira lo stesso', () => {
    return runVideoWithUpstreamText('text', { prompt: 'a slow pan over the mountains' });
  });

  it('un\'immagine senza prompt proprio ma wired a un doc gira con il suo content', async () => {
    const DOC_NODE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const { db } = fakeDb(
      {
        nodes: [freshNodeRow, { ...freshNodeRow, id: DOC_NODE, type: 'doc', data: { content: 'note del brand' } }],
        nodes_connections: [
          {
            id: 'e1',
            canvas_id: CANVAS,
            source_node_id: DOC_NODE,
            target_node_id: NODE,
            source_handle: null,
            target_handle: null
          }
        ],
        assets: []
      },
      { updateRows: { nodes: [{ ...freshNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: '',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result.kind).toBe('done');
    expect(generateImagesWithoutBrand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: 'note del brand' })
    );
  });

  it('un video senza prompt proprio ma wired a un doc gira con il suo content', () => {
    return runVideoWithUpstreamText('doc', { content: 'note del brand' }, 'note del brand');
  });

  async function runVideoWithUpstreamText(
    sourceType: 'text' | 'doc',
    sourceData: Record<string, unknown>,
    expectedPrompt = 'a slow pan over the mountains'
  ) {
    generateVideoWithoutBrand.mockReset();
    generateVideoWithoutBrand.mockResolvedValue({ ok: true, jobId: 'job-1' });

    const SOURCE_NODE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const videoNodeRow = { ...freshNodeRow, type: 'video' };
    const { db } = fakeDb(
      {
        nodes: [videoNodeRow, { ...freshNodeRow, id: SOURCE_NODE, type: sourceType, data: sourceData }],
        nodes_connections: [
          {
            id: 'e1',
            canvas_id: CANVAS,
            source_node_id: SOURCE_NODE,
            target_node_id: NODE,
            source_handle: null,
            target_handle: null
          }
        ],
        assets: []
      },
      { updateRows: { nodes: [{ ...videoNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'video',
      prompt: '',
      model: 'some/video-model',
      params: {},
      expectedVersion: 1
    });

    expect(result.kind).toBe('queued');
    expect(generateVideoWithoutBrand).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expectedPrompt })
    );
  }
});

/**
 * UN NODO TESTO CON UN'IMMAGINE A MONTE LA MANDA AL MODELLO — le porte di un nodo testo
 * (`connectors.ts`) possono aprire immagini/video/audio quando il modello scelto le legge, e
 * quel che arriva su quelle porte deve raggiungere `llmText`, non fermarsi al prompt scritto.
 */
describe('un nodo testo con un\'immagine/video/audio a monte li manda al modello', () => {
  const IMAGE_NODE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const textNodeRow = { ...freshNodeRow, type: 'text' };

  beforeEach(() => {
    llmText.mockReset();
    llmText.mockResolvedValue({ text: 'la didascalia', citations: [] });
  });

  it('runGenNode su un nodo testo manda le immagini a monte a llmText, come referenceImageUrls', async () => {
    const { db } = fakeDb(
      {
        nodes: [
          textNodeRow,
          {
            ...freshNodeRow,
            id: IMAGE_NODE,
            type: 'image',
            data: { refId: 'asset-1' }
          }
        ],
        nodes_connections: [
          {
            id: 'e1',
            canvas_id: CANVAS,
            source_node_id: IMAGE_NODE,
            target_node_id: NODE,
            source_handle: null,
            target_handle: null
          }
        ],
        assets: [{ id: 'asset-1', org_id: ORG, project_id: PROJECT, type: 'image', url: 'u/media/upstream.png', mime_type: 'image/png' }]
      },
      { updateRows: { nodes: [{ ...textNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'text',
      prompt: 'descrivi questa immagine',
      model: 'anthropic/claude-haiku-4.5',
      params: {},
      expectedVersion: 1
    });

    expect(result.kind).toBe('done');
    expect(llmText).toHaveBeenCalledWith(
      expect.objectContaining({
        upstream: expect.objectContaining({ imageUrls: expect.arrayContaining([expect.stringContaining('upstream.png')]) })
      })
    );
  });
});

/**
 * UN MODELLO SPARITO DA `ai_models` BLOCCA IL NODO, PRIMA di spendere — mai dopo aver chiesto al
 * provider. Il caso non è "non ancora sincronizzato" (il selettore offre solo modelli con una riga
 * sincronizzata): è un modello che il nodo aveva già scelto, e che `ai_models` non conferma più a
 * questo giro. Il prompt e il `refId` del giro precedente NON si toccano — solo `running`/`error`
 * cambiano, la stessa disciplina di `giveUp()`.
 */
describe('un modello sparito da ai_models blocca il nodo senza toccare il suo stato', () => {
  const priorRefId = '99999999-9999-9999-9999-999999999999';

  beforeEach(() => {
    modalitiesOf.mockReset();
    modalitiesOf.mockResolvedValue(null);
    generateImagesWithoutBrand.mockReset();
  });

  it('rifiuta con una ragione che nomina il modello, e non spende nulla', async () => {
    const priorNodeRow = { ...freshNodeRow, data: { prompt: 'a cat wearing a hat', model: 'openai/gpt-image', refId: priorRefId } };

    const { db, calls } = fakeDb(
      { nodes: [priorNodeRow] },
      { updateRows: { nodes: [{ ...priorNodeRow, version: 2 }] } }
    );

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: 'a cat wearing a hat',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result).toMatchObject({ kind: 'refused', error: expect.stringContaining('openai/gpt-image') });
    expect(generateImagesWithoutBrand).not.toHaveBeenCalled();

    const nodeUpdates = calls.filter((c) => c.table === 'nodes' && c.op === 'update');
    const lastUpdate = nodeUpdates[nodeUpdates.length - 1];
    const data = (lastUpdate?.payload as { data?: Record<string, unknown> })?.data;

    expect(data?.running).toBe(false);
    expect(data?.error).toContain('openai/gpt-image');
    // Il prompt e il risultato del giro precedente sopravvivono: solo la generazione si è fermata.
    expect(data?.prompt).toBe('a cat wearing a hat');
    expect(data?.refId).toBe(priorRefId);
  });
});

/**
 * IL BOTTONE RIMASTO SPENTO. Una `node_runs` che non ha mai smesso di essere `running` — una
 * richiesta morta a metà, senza chi la finisca — deve poter uscire da sola: nessun cron esiste
 * ancora per le immagini, ed è QUESTO il buco che la segnalazione descrive.
 */
describe('una run rimasta running non ha altra via se non il timeout', () => {
  it('la chiude expired e riaccende il nodo per il prossimo tentativo', async () => {
    const { db, calls } = fakeDb(
      { node_runs: [runRow], nodes: [nodeRow] },
      { updateRows: { node_runs: [runRow], nodes: [nodeRow] } }
    );

    const result = await expireStuckRuns(db);

    expect(result).toMatchObject({ expired: 1 });

    const runUpdate = calls.find(
      (c) => c.table === 'node_runs' && c.op === 'update' && (c.payload as { status?: string })?.status === 'expired'
    );
    expect(runUpdate?.payload).toMatchObject({ status: 'expired' });

    const nodeUpdate = calls.find((c) => c.table === 'nodes' && c.op === 'update');
    expect(nodeUpdate?.payload).toMatchObject({ data: expect.objectContaining({ running: false }) });
  });

  it('non tocca una run ancora dentro la finestra', async () => {
    const fresh = { ...runRow, started_at: new Date().toISOString() };
    const { db } = fakeDb({ node_runs: [], nodes: [nodeRow] });
    void fresh;

    const result = await expireStuckRuns(db);

    expect(result).toMatchObject({ expired: 0 });
  });

  /**
   * UN BIGLIETTO DI LOOP `queued` (`loop.ts::enqueueLoop`) resta `status: 'running'` finché un
   * tick non lo reclama — anche per PIÙ di `RUN_STALE_MS`, se la coda è lunga e il suo turno non
   * è ancora arrivato. Scambiarlo per un giro perso lo chiuderebbe `expired` mentre aspettava
   * solo di essere drenato: il difetto che questo test tiene fermo.
   */
  it('non scade un biglietto di loop ancora in coda, per quanto vecchio', async () => {
    const ticketRow = { ...runRow, params: { loop: { phase: 'queued', outputListNodeId: 'list-1', label: 'v1', values: {} } } };
    const { db, calls } = fakeDb({ node_runs: [ticketRow], nodes: [nodeRow] });

    const result = await expireStuckRuns(db);

    expect(result).toMatchObject({ expired: 0 });
    expect(calls.some((c) => c.table === 'node_runs' && c.op === 'update')).toBe(false);
  });
});

/**
 * UNA TABELLA `nodes` CHE SI COMPORTA DAVVERO: la versione conta, e un UPDATE con la versione
 * sbagliata torna zero righe — esattamente il vincolo ottimistico che `fakeDb` (statico) non può
 * simulare, perché la stessa `updateRows` risponderebbe uguale a ogni chiamata.
 */
type StatefulNodesDb = { db: Db; bumpVersion: (data: Record<string, unknown>) => void; currentNode: () => { data: Record<string, unknown>; version: number } };

function statefulNodesDb(initial: { id: string; orgId: string; data: Record<string, unknown>; version: number }): StatefulNodesDb {
  const state = { data: { ...initial.data }, version: initial.version };
  const runs: Array<{ id: string; status: string; error: string | null; cost_usd: number | null }> = [];
  let runSeq = 0;

  const nodeRow = () => ({
    id: initial.id,
    canvas_id: 'canvas',
    project_id: 'project',
    type: 'image',
    display_name: null,
    x: 0,
    y: 0,
    z: 0,
    width: null,
    height: null,
    data: state.data,
    version: state.version
  });

  const db = {
    from(table: string) {
      if (table === 'nodes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: nodeRow(), error: null }),
                  // `upstreamInputsFor` chiama `listNodes`, che finisce con `.order(...)` e si
                  // aspetta un array — questo nodo, senza archi in ingresso in questo scenario.
                  order: () => Promise.resolve({ data: [nodeRow()], error: null })
                })
              })
            })
          }),
          update: (patch: { data: Record<string, unknown>; version: number }) => ({
            eq: () => ({
              eq: () => ({
                eq: (column: string, expectedVersion: number) => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (column !== 'version' || expectedVersion !== state.version) {
                        return { data: null, error: null };
                      }
                      state.data = patch.data;
                      state.version = patch.version;
                      return { data: nodeRow(), error: null };
                    }
                  })
                })
              })
            })
          })
        };
      }

      if (table === 'node_runs') {
        return {
          insert: (payload: { status: string }) => ({
            select: () => ({
              single: async () => {
                const id = `run-${++runSeq}`;
                runs.push({ id, status: payload.status, error: null, cost_usd: null });
                return {
                  data: {
                    id,
                    org_id: initial.orgId,
                    node_id: initial.id,
                    prompt: 'p',
                    model: 'm',
                    params: {},
                    status: payload.status,
                    error: null,
                    output_asset_id: null,
                    external_job_id: null,
                    cost_usd: null,
                    attempts: 0,
                    started_at: new Date().toISOString(),
                    finished_at: null
                  },
                  error: null
                };
              }
            })
          }),
          update: (patch: { status?: string; error?: string }) => ({
            eq: (_col: string, runId: string) => ({
              eq: () => {
                const run = runs.find((r) => r.id === runId);
                if (run) {
                  Object.assign(run, patch);
                }
                return Promise.resolve({ data: null, error: null });
              }
            })
          })
        };
      }

      if (table === 'nodes_connections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) })
            })
          })
        };
      }

      if (table === 'assets') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) })
            })
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({
                data: { id: 'asset-new', duration_s: null, bytes: null, content: null, created_at: new Date().toISOString(), ...row },
                error: null
              })
            })
          })
        };
      }

      // `writeNodeData` scrive `canvas_events` a ogni scrittura riuscita: questo scenario non
      // guarda l'audit trail, solo che la scrittura del contenuto non si perda a un conflitto.
      if (table === 'canvas_events') {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: { id: 1, created_at: new Date().toISOString(), ...payload }, error: null })
            })
          })
        };
      }

      throw new Error(`statefulNodesDb: unhandled table "${table}"`);
    }
  };
  return {
    db: db as unknown as Db,
    // Simula la scrittura concorrente — il trascinamento, un altro pannello — che arriva DENTRO
    // la finestra fra il click e il fallimento, e che `runGenNode` non può vedere: la versione
    // che porta in mano è quella del click, già superata quando la generazione fallisce.
    bumpVersion: (data: Record<string, unknown>) => {
      state.data = data;
      state.version += 1;
    },
    currentNode: () => ({ data: state.data, version: state.version })
  };
}

/**
 * LA CORSA CHE `giveUp()` PERDEVA IN SILENZIO.
 *
 * `runGenNode` legge la versione al click (1). Prima che la generazione fallisca, un'altra
 * scrittura (il trascinamento, un altro pannello) alza la tela a versione 2. La chiusura
 * dell'errore, scritta con la versione 1 che `runGenNode` porta ancora in mano, trova un conflitto
 * — e SENZA un ritentativo quello zero-righe passava per un successo muto: `node_runs.status`
 * diventava `failed` ma il nodo restava `running:true` per sempre, invisibile a chiunque non
 * legga la tabella a mano.
 */
describe('un giro fallito non perde la sua chiusura a un conflitto di versione', () => {
  beforeEach(() => {
    generateImagesWithoutBrand.mockReset();
  });

  it('il nodo esce da running:true anche se la versione è cambiata nel frattempo', async () => {
    const { db, bumpVersion, currentNode } = statefulNodesDb({ id: NODE, orgId: ORG, data: {}, version: 1 });

    // La corsa vera: la scrittura concorrente arriva DOPO che `runGenNode` ha già segnato il nodo
    // `running:true` (quindi già alla versione 2) e PRIMA che la generazione fallisca — proprio la
    // finestra in cui `giveUp()` porta ancora in mano la versione del click.
    generateImagesWithoutBrand.mockImplementation(async () => {
      bumpVersion({ ...currentNode().data, note: 'a concurrent drag landed mid-generation' });
      return { ok: false, error: 'render_failed' };
    });

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: 'this will fail',
      model: 'openai/gpt-image',
      params: {},
      // La versione al click: 1. Nel frattempo il nodo è già a 2 — runGenNode non lo sa ancora,
      // esattamente come nella corsa reale.
      expectedVersion: 1
    });

    expect(result.kind).toBe('refused');

    const data = currentNode().data as { running?: boolean; error?: string | null; note?: string };
    expect(data.running).toBe(false);
    expect(data.error).toBeTruthy();
    expect(data.note).toBe('a concurrent drag landed mid-generation');
  });
});

describe('un giro riuscito arriva sul nodo anche se la versione è cambiata nel frattempo', () => {
  beforeEach(() => {
    generateImagesWithoutBrand.mockReset();
  });

  it('refId del render nuovo atterra e la scrittura concorrente resta', async () => {
    const { db, bumpVersion, currentNode } = statefulNodesDb({ id: NODE, orgId: ORG, data: {}, version: 1 });

    generateImagesWithoutBrand.mockImplementation(async () => {
      bumpVersion({ ...currentNode().data, running: false, note: 'a concurrent save landed mid-generation' });
      return { ok: true, media: [{ storage_path: 'u/media/generated.png', mime: 'image/png', width: 1024, height: 1024 }], costUsd: 0.04 };
    });

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: 'a cat',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result.kind).toBe('done');

    const data = currentNode().data as { refId?: string; running?: boolean; note?: string };
    expect(data.refId).toBe('asset-new');
    expect(data.running).toBe(false);
    expect(data.note).toBe('a concurrent save landed mid-generation');
  });
});

/**
 * RIGENERARE NON DEVE SPEGNERE QUEL CHE C'È GIÀ, NEMMENO PER UN ISTANTE.
 *
 * `runGenNode` segna `running:true` scrivendo un `data` nuovo di zecca invece di partire da
 * quello che il nodo aveva — e quel nodo aveva un `refId`, l'immagine di prima. La prima
 * scrittura lo cancella subito, prima ancora di sapere se il nuovo giro riuscirà: se poi fallisce,
 * `giveUp` parte da un `prior` che non lo ha già più, e l'immagine buona sparisce per un giro che
 * non ha prodotto niente.
 */
describe('rigenerare un nodo che ha già un risultato non lo perde se il nuovo giro fallisce', () => {
  beforeEach(() => {
    generateImagesWithoutBrand.mockReset();
  });

  it('refId di prima sopravvive a un giro che fallisce', async () => {
    const { db, currentNode } = statefulNodesDb({
      id: NODE,
      orgId: ORG,
      data: { prompt: 'a cat', model: 'openai/gpt-image', params: {}, refId: 'asset-before', running: false, error: null },
      version: 1
    });

    generateImagesWithoutBrand.mockResolvedValue({ ok: false, error: 'render_failed' });

    const result = await runGenNode(db, {
      orgId: ORG,
      projectId: PROJECT,
      canvasId: CANVAS,
      nodeId: NODE,
      userId: USER,
      medium: 'image',
      prompt: 'a dog now',
      model: 'openai/gpt-image',
      params: {},
      expectedVersion: 1
    });

    expect(result.kind).toBe('refused');

    const data = currentNode().data as { refId?: string; running?: boolean; error?: string | null };
    expect(data.refId).toBe('asset-before');
    expect(data.running).toBe(false);
    expect(data.error).toBeTruthy();
  });
});

/**
 * IL PONTE CHE `runGenNode` NON COSTRUISCE DA SOLO: un video torna `queued` e resta lì finché
 * qualcosa non chiude `node_runs`. `reconcileVideoNodeRuns` è quel qualcosa — legge la riga
 * `node_runs` in coda (running + external_job_id), la reclama, chiede a `finishVideoRender` (qui
 * finto) se il fornitore ha finito, e sui tre esiti scrive lo stesso contratto di `runGenNode`:
 * `done` deposita l'asset e spegne `running`, `pending` rilascia il claim senza consumare un
 * tentativo, `failed` chiude il giro E il nodo insieme, mai l'uno senza l'altro.
 */
function videoReconcileDb(initial: {
  node: { id: string; orgId: string; data: Record<string, unknown>; version: number };
  run: { id: string; taskId: string; attempts?: number };
}) {
  const nodeState = { data: { ...initial.node.data }, version: initial.node.version };
  const runState = {
    id: initial.run.id,
    org_id: initial.node.orgId,
    node_id: initial.node.id,
    prompt: 'a dancing cat',
    model: 'grok-imagine-video-1-5-preview',
    params: { aspectRatio: '1:1', duration: 1 },
    status: 'running',
    error: null as string | null,
    output_asset_id: null as string | null,
    external_job_id: initial.run.taskId,
    cost_usd: null as number | null,
    attempts: initial.run.attempts ?? 0,
    actor_id: 'user-1',
    started_at: new Date().toISOString(),
    finished_at: null as string | null
  };
  const insertedAssets: Array<{ url: string; type: string; source: string }> = [];

  const nodeRow = () => ({
    id: initial.node.id,
    canvas_id: 'canvas',
    project_id: 'project',
    type: 'video',
    display_name: null,
    x: 0,
    y: 0,
    z: 0,
    width: null,
    height: null,
    data: nodeState.data,
    version: nodeState.version
  });

  const db = {
    from(table: string) {
      if (table === 'node_runs') {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({ data: runState.status === 'running' ? [{ ...runState }] : [], error: null })
                })
              })
            })
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col1: string, val1: string) => ({
              eq: (col2: string, val2: string) => {
                const finish = async () => {
                  if (val1 !== runState.id) return { data: null, error: null };
                  Object.assign(runState, patch);
                  return { data: { ...runState }, error: null };
                };
                return {
                  eq: (col3: string, expected: string) => ({
                    select: () => ({ maybeSingle: async () => {
                      if (expected !== 'running' && expected !== 'finishing') return { data: null, error: null };
                      if (runState.status !== expected) return { data: null, error: null };
                      return finish();
                    } }),
                    then: (resolve: (v: { data: null; error: null }) => void) => {
                      if (runState.status === expected) {
                        Object.assign(runState, patch);
                      }
                      resolve({ data: null, error: null });
                    }
                  }),
                  then: (resolve: (v: { data: null; error: null }) => void) => {
                    Object.assign(runState, patch);
                    resolve({ data: null, error: null });
                  }
                };
              }
            })
          })
        };
      }

      if (table === 'nodes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({ maybeSingle: async () => ({ data: nodeRow(), error: null }) })
              })
            })
          }),
          update: (patch: { data: Record<string, unknown>; version: number }) => ({
            eq: () => ({
              eq: () => ({
                eq: (column: string, expectedVersion: number) => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (column !== 'version' || expectedVersion !== nodeState.version) {
                        return { data: null, error: null };
                      }
                      nodeState.data = patch.data;
                      nodeState.version = patch.version;
                      return { data: nodeRow(), error: null };
                    }
                  })
                })
              })
            })
          })
        };
      }

      if (table === 'video_renders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'render-1',
                  task_id: runState.external_job_id,
                  model: runState.model,
                  prompt: runState.prompt,
                  duration_seconds: 1,
                  resolution: '480p',
                  cover_url: null,
                  persist_opts: { captions: false, tighten: false },
                  submitted_at: new Date().toISOString()
                },
                error: null
              })
            })
          })
        };
      }

      if (table === 'assets') {
        return {
          insert: (payload: { url: string; type: string; source: string }) => ({
            select: () => ({
              single: async () => {
                insertedAssets.push(payload);
                return {
                  data: {
                    id: 'asset-video-1',
                    project_id: 'project',
                    type: payload.type,
                    url: payload.url,
                    content: null,
                    mime_type: 'video/mp4',
                    bytes: null,
                    width: null,
                    height: null,
                    duration_s: 1,
                    source: payload.source,
                    source_node_id: initial.node.id,
                    created_at: new Date().toISOString()
                  },
                  error: null
                };
              }
            })
          })
        };
      }

      if (table === 'canvas_events') {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: { id: 1, created_at: new Date().toISOString(), ...payload }, error: null })
            })
          })
        };
      }

      throw new Error(`videoReconcileDb: unhandled table "${table}"`);
    }
  };

  return {
    db: db as unknown as Db,
    currentNode: () => ({ data: nodeState.data, version: nodeState.version }),
    currentRun: () => ({ ...runState }),
    insertedAssets
  };
}

describe('reconcileVideoNodeRuns chiude un video in coda quando il fornitore ha finito', () => {
  beforeEach(() => {
    finishVideoRender.mockReset();
  });

  it('done: deposita un asset video, spegne running e scrive il costo', async () => {
    finishVideoRender.mockResolvedValue({
      status: 'done',
      url: 'https://storage.example/media/user-1/generated/clip.mp4',
      durationSeconds: 1,
      resolution: '480p'
    });

    const { db, currentNode, currentRun, insertedAssets } = videoReconcileDb({
      node: { id: NODE, orgId: ORG, data: { prompt: 'a dancing cat', model: 'grok-imagine-video-1-5-preview', running: true }, version: 3 },
      run: { id: RUN, taskId: 'openrouter:job-1' }
    });

    const result = await reconcileVideoNodeRuns(db);

    expect(result).toMatchObject({ checked: 1, done: 1, failed: 0, pending: 0 });
    expect(insertedAssets).toHaveLength(1);
    expect(insertedAssets[0]).toMatchObject({ type: 'video', source: 'generated', url: expect.stringContaining('clip.mp4') });

    expect(currentRun().status).toBe('done');
    expect(currentRun().output_asset_id).toBe('asset-video-1');

    const data = currentNode().data as { running?: boolean; error?: string | null; refId?: string };
    expect(data.running).toBe(false);
    expect(data.error).toBeNull();
    expect(data.refId).toBe('asset-video-1');
  });

  it('pending: rilascia il claim senza consumare un tentativo', async () => {
    finishVideoRender.mockResolvedValue({ status: 'pending' });

    const { db, currentNode, currentRun } = videoReconcileDb({
      node: { id: NODE, orgId: ORG, data: { running: true }, version: 1 },
      run: { id: RUN, taskId: 'openrouter:job-2' }
    });

    const result = await reconcileVideoNodeRuns(db);

    expect(result).toMatchObject({ checked: 1, done: 0, failed: 0, pending: 1 });
    expect(currentRun().status).toBe('running');
    expect(currentRun().attempts).toBe(0);
    // Il nodo non si tocca finché il fornitore non ha detto sì o no.
    expect((currentNode().data as { running?: boolean }).running).toBe(true);
  });

  it('failed dopo il tetto dei tentativi: chiude la run E riaccende il nodo insieme', async () => {
    finishVideoRender.mockResolvedValue({ status: 'failed', error: 'provider rejected the job' });

    const { db, currentNode, currentRun } = videoReconcileDb({
      node: { id: NODE, orgId: ORG, data: { prompt: 'a dancing cat', model: 'grok-imagine-video-1-5-preview', running: true }, version: 5 },
      run: { id: RUN, taskId: 'openrouter:job-3', attempts: 7 }
    });

    const result = await reconcileVideoNodeRuns(db);

    expect(result).toMatchObject({ checked: 1, done: 0, failed: 1, pending: 0 });
    expect(currentRun().status).toBe('failed');
    expect(currentRun().error).toContain('provider rejected the job');

    const data = currentNode().data as { running?: boolean; error?: string | null };
    expect(data.running).toBe(false);
    expect(data.error).toContain('provider rejected the job');
  });
});
