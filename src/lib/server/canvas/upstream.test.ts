import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';
import { upstreamInputsFor } from './upstream';

const { modalitiesOf } = vi.hoisted(() => ({ modalitiesOf: vi.fn() }));
vi.mock('$lib/server/ai-models-sync', () => ({ modalitiesOf }));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => ({}) }));

const ORG = '11111111-1111-1111-1111-111111111111';
const CANVAS = '22222222-2222-2222-2222-222222222222';
const TEXT_NODE = '33333333-3333-3333-3333-333333333333';
const IMAGE_NODE = '44444444-4444-4444-4444-444444444444';
const VIDEO_NODE = '66666666-6666-6666-6666-666666666666';
const SOURCE_VIDEO_NODE = '77777777-7777-7777-7777-777777777777';
const ASSET = '55555555-5555-5555-5555-555555555555';
const VIDEO_ASSET = '88888888-8888-8888-8888-888888888888';
const INFLUENCER_NODE = '99999999-9999-9999-9999-999999999999';
const LIST_NODE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SELECT_NODE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const IMAGE_ASSET_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const IMAGE_ASSET_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const INFLUENCER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const MODEL = 'bytedance/seedance-2-5';

const nodeRow = (id: string, type: string, data: Record<string, unknown>) => ({
  id,
  canvas_id: CANVAS,
  project_id: 'p1',
  type,
  display_name: null,
  x: 0,
  y: 0,
  z: 0,
  width: null,
  height: null,
  data,
  version: 1
});

beforeEach(() => {
  modalitiesOf.mockReset();
  modalitiesOf.mockResolvedValue({ input: ['text', 'image', 'video', 'audio'], output: ['video'], synced_at: 'now' });
});

describe('upstreamInputsFor — dal database alla forma pura', () => {
  it('legge il testo dell\'ultimo giro di un nodo testo attraverso il suo asset', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(TEXT_NODE, 'text', { prompt: 'scrivi qualcosa', refId: ASSET }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: MODEL })
      ],
      nodes_connections: [
        {
          id: 'e1',
          canvas_id: CANVAS,
          source_node_id: TEXT_NODE,
          target_node_id: IMAGE_NODE,
          source_handle: null,
          target_handle: null
        }
      ],
      assets: [{ id: ASSET, project_id: 'p1', type: 'text', url: null, content: 'ciao mondo', mime_type: 'text/plain', bytes: null, width: null, height: null, duration_s: null, source: 'generated', source_node_id: TEXT_NODE, created_at: 'now' }]
    });

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: MODEL,
      medium: 'image'
    });

    expect(out.text).toEqual(['ciao mondo']);
    expect(out.blocked).toBeNull();
  });

  it('un nodo testo mai girato alimenta col suo prompt, non con niente', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(TEXT_NODE, 'text', { prompt: 'scrivi qualcosa' }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: MODEL })
      ],
      nodes_connections: [
        {
          id: 'e1',
          canvas_id: CANVAS,
          source_node_id: TEXT_NODE,
          target_node_id: IMAGE_NODE,
          source_handle: null,
          target_handle: null
        }
      ],
      assets: []
    });

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: MODEL,
      medium: 'image'
    });

    expect(out.text).toEqual(['scrivi qualcosa']);
    expect(out.rejected).toEqual([]);
  });

  it('legge il `content` di un `doc` senza passare da un asset', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(TEXT_NODE, 'doc', { content: 'appunti', public: false }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: MODEL })
      ],
      nodes_connections: [
        {
          id: 'e1',
          canvas_id: CANVAS,
          source_node_id: TEXT_NODE,
          target_node_id: IMAGE_NODE,
          source_handle: null,
          target_handle: null
        }
      ],
      assets: []
    });

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: MODEL,
      medium: 'image'
    });

    expect(out.text).toEqual(['appunti']);
  });

  it('un nodo senza archi in ingresso non riceve niente', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(IMAGE_NODE, 'image', { prompt: '', model: MODEL })],
      nodes_connections: [],
      assets: []
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE, model: MODEL });

    expect(out).toMatchObject({ text: [], referenceImageUrls: [], rejected: [], blocked: null });
  });

  it('senza un modello scelto sul nodo, nessun controllo parte e le modalità restano vuote', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(IMAGE_NODE, 'image', { prompt: '' })],
      nodes_connections: [],
      assets: []
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE });

    expect(out.blocked).toBeNull();
    expect(modalitiesOf).not.toHaveBeenCalled();
  });
});

describe('upstreamInputsFor — un nodo influencer, dal database vero fino al resolver', () => {
  /**
   * IL GIRO REALE, NON SOLO IL RESOLVER PURO: `resolveUpstreamInputs` (testato a parte in
   * `upstream-inputs.test.ts`) accetta già `mediaUrls`, ma questo file è quello che li COSTRUISCE
   * da `influencer_views` — senza questa lettura, un influencer collegato alla tela darebbe
   * sempre zero riferimenti, non un problema di logica ma di collegamento mancante (CLAUDE.md:
   * "una funzione non esiste finché non è collegata"). Qui si prova che `toUpstreamNode` legge
   * `influencer_views`, le firma e le passa nell'ordine giusto.
   */
  it('le viste di un influencer collegato diventano referenceImageUrls, firmate e ordinate', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(INFLUENCER_NODE, 'influencer', { influencer_id: INFLUENCER_ID }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        {
          id: 'e1',
          canvas_id: CANVAS,
          source_node_id: INFLUENCER_NODE,
          target_node_id: IMAGE_NODE,
          source_handle: null,
          target_handle: null
        }
      ],
      // `fakeDb` non applica `.order()` davvero — quello è compito di Postgres, non di questo
      // codice — quindi le righe arrivano già nell'ordine che `sort_order` produrrebbe: questo
      // test prova che `toUpstreamNode` LEGGE e passa `influencer_views` intatte, non che
      // Supabase sappia ordinare una `select`.
      influencer_views: [
        {
          id: 'v1',
          influencer_id: INFLUENCER_ID,
          view_key: 'face-front',
          label: 'Face · Front',
          storage_path: `catalogue/${INFLUENCER_ID}/face-front.webp`,
          mime_type: 'image/webp',
          width: 1024,
          height: 1365,
          sort_order: 10
        },
        {
          id: 'v2',
          influencer_id: INFLUENCER_ID,
          view_key: 'body-front',
          label: 'Body · Front',
          storage_path: `catalogue/${INFLUENCER_ID}/body-front.webp`,
          mime_type: 'image/webp',
          width: 1024,
          height: 1365,
          sort_order: 20
        }
      ],
      assets: []
    });

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: 'qwen3-pro',
      medium: 'image'
    });

    expect(out.blocked).toBeNull();
    expect(out.referenceImageUrls).toEqual([
      `https://signed.example/influencers/catalogue/${INFLUENCER_ID}/face-front.webp`,
      `https://signed.example/influencers/catalogue/${INFLUENCER_ID}/body-front.webp`
    ]);
    expect(out.referenceImageUrl).toBe(out.referenceImageUrls[0]);
    expect(out.rejected).toEqual([]);
  });

  it('un influencer senza viste ancora importate non alimenta niente, e non spacca il giro', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(INFLUENCER_NODE, 'influencer', { influencer_id: INFLUENCER_ID }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: MODEL })
      ],
      nodes_connections: [
        {
          id: 'e1',
          canvas_id: CANVAS,
          source_node_id: INFLUENCER_NODE,
          target_node_id: IMAGE_NODE,
          source_handle: null,
          target_handle: null
        }
      ],
      influencer_views: [],
      assets: []
    });

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: MODEL,
      medium: 'image'
    });

    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: INFLUENCER_NODE, why: expect.stringContaining('non ancora') }]);
  });
});

describe('upstreamInputsFor — un modello sparito da ai_models blocca il nodo', () => {
  const videoToVideoDb = () =>
    fakeDb({
      nodes: [
        nodeRow(SOURCE_VIDEO_NODE, 'video', { prompt: 'una clip', refId: VIDEO_ASSET }),
        nodeRow(VIDEO_NODE, 'video', { prompt: '', model: MODEL })
      ],
      nodes_connections: [
        {
          id: 'e1',
          canvas_id: CANVAS,
          source_node_id: SOURCE_VIDEO_NODE,
          target_node_id: VIDEO_NODE,
          source_handle: null,
          target_handle: null
        }
      ],
      assets: [
        {
          id: VIDEO_ASSET,
          project_id: 'p1',
          type: 'video',
          url: 'https://cdn/clip.mp4',
          content: null,
          mime_type: 'video/mp4',
          bytes: null,
          width: null,
          height: null,
          duration_s: 5,
          source: 'generated',
          source_node_id: SOURCE_VIDEO_NODE,
          created_at: 'now'
        }
      ]
    });

  it('un modello sincronizzato risolve normalmente, mai bloccato', async () => {
    const { db } = videoToVideoDb();

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: VIDEO_NODE,
      model: MODEL,
      medium: 'video'
    });

    expect(out.blocked).toBeNull();
    expect(out.referenceVideoUrls).toEqual(['https://cdn/clip.mp4']);
  });

  it('un modello che `ai_models` non conferma più blocca il nodo intero, con la ragione', async () => {
    modalitiesOf.mockResolvedValue(null);
    const { db } = videoToVideoDb();

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: VIDEO_NODE,
      model: MODEL,
      medium: 'video'
    });

    expect(out.blocked).toContain(MODEL);
    // Bloccato vuol dire NIENTE risolto — non un arco rifiutato, il nodo intero non gira.
    expect(out.referenceVideoUrls).toEqual([]);
    expect(out.text).toEqual([]);
  });

  it('un modello bloccato non legge nemmeno nodi e archi: nessuna query sprecata', async () => {
    modalitiesOf.mockResolvedValue(null);
    const { db, calls } = fakeDb({ nodes: [], nodes_connections: [], assets: [] });

    await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: VIDEO_NODE, model: MODEL, medium: 'video' });

    expect(calls.some((c) => c.table === 'nodes')).toBe(false);
    expect(calls.some((c) => c.table === 'nodes_connections')).toBe(false);
  });

  it('senza un medium, nessun controllo modello parte — non sa quale spec tradurre', async () => {
    modalitiesOf.mockResolvedValue(null);
    const { db, calls } = fakeDb({ nodes: [], nodes_connections: [], assets: [] });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: VIDEO_NODE, model: MODEL });

    expect(out.blocked).toBeNull();
    expect(modalitiesOf).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === 'nodes')).toBe(true);
  });

  it('un modello che NON prende video (ma esiste) rifiuta solo quell\'arco, non blocca il nodo', async () => {
    modalitiesOf.mockResolvedValue({ input: ['text', 'image'], output: ['video'], synced_at: 'now' });
    const { db } = videoToVideoDb();

    const out = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: VIDEO_NODE,
      model: MODEL,
      medium: 'video'
    });

    expect(out.blocked).toBeNull();
    expect(out.referenceVideoUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: SOURCE_VIDEO_NODE, why: expect.stringContaining('connettore') }]);
  });

  it('passa il medium a `modalitiesOf`, così l\'id interno si traduce sul listino giusto', async () => {
    const { db } = videoToVideoDb();

    await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: VIDEO_NODE, model: MODEL, medium: 'video' });

    expect(modalitiesOf).toHaveBeenCalledWith(expect.anything(), MODEL, 'video');
  });
});

describe('upstreamInputsFor — list: fisso, porta ogni item risolto ad asset reale', () => {
  it('una lista immagini con asset_id alimenta referenceImageUrls con gli url veri', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(LIST_NODE, 'list', {
          item_kind: 'image',
          items: [{ label: 'a', asset_id: IMAGE_ASSET_1 }, { label: 'b', asset_id: IMAGE_ASSET_2 }]
        }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: LIST_NODE, target_node_id: IMAGE_NODE, source_handle: null, target_handle: null }
      ],
      assets: [
        { id: IMAGE_ASSET_1, project_id: 'p1', type: 'image', url: 'canvas-assets/a.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' },
        { id: IMAGE_ASSET_2, project_id: 'p1', type: 'image', url: 'canvas-assets/b.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' }
      ]
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE, model: 'qwen3-pro', medium: 'image' });

    expect(out.blocked).toBeNull();
    expect(out.referenceImageUrls).toEqual(['canvas-assets/a.png', 'canvas-assets/b.png']);
    expect(out.rejected).toEqual([]);
  });

  it('una lista di testo su un filo fisso porta ogni riga come UN blocco di testo (il connettore non è list-valued)', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(LIST_NODE, 'list', { item_kind: 'text', items: [{ label: 'a', text: 'primo' }, { label: 'b', text: 'secondo' }] }),
        nodeRow(TEXT_NODE, 'text', { prompt: '' })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: LIST_NODE, target_node_id: TEXT_NODE, source_handle: null, target_handle: null }
      ],
      assets: []
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: TEXT_NODE });

    expect(out.text).toEqual(['primo\n\nsecondo']);
  });
});

describe('upstreamInputsFor — select: risolve ESATTAMENTE l\'item scelto dalla lista a monte', () => {
  it('un select su una lista immagini porta solo l\'item all\'indice scelto (1-based)', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(LIST_NODE, 'list', {
          item_kind: 'image',
          items: [{ label: 'a', asset_id: IMAGE_ASSET_1 }, { label: 'b', asset_id: IMAGE_ASSET_2 }]
        }),
        nodeRow(SELECT_NODE, 'select', { index: 2 }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        { id: 'e-list-select', canvas_id: CANVAS, source_node_id: LIST_NODE, target_node_id: SELECT_NODE, source_handle: null, target_handle: null },
        { id: 'e-select-image', canvas_id: CANVAS, source_node_id: SELECT_NODE, target_node_id: IMAGE_NODE, source_handle: null, target_handle: null }
      ],
      assets: [
        { id: IMAGE_ASSET_1, project_id: 'p1', type: 'image', url: 'canvas-assets/a.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' },
        { id: IMAGE_ASSET_2, project_id: 'p1', type: 'image', url: 'canvas-assets/b.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' }
      ]
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE, model: 'qwen3-pro', medium: 'image' });

    expect(out.blocked).toBeNull();
    expect(out.referenceImageUrls).toEqual(['canvas-assets/b.png']);
    expect(out.rejected).toEqual([]);
  });

  it('un select fuori range non alimenta niente, e lo dice — mai un valore a caso', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(LIST_NODE, 'list', { item_kind: 'image', items: [{ label: 'a', asset_id: IMAGE_ASSET_1 }] }),
        nodeRow(SELECT_NODE, 'select', { index: 5 }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        { id: 'e-list-select', canvas_id: CANVAS, source_node_id: LIST_NODE, target_node_id: SELECT_NODE, source_handle: null, target_handle: null },
        { id: 'e-select-image', canvas_id: CANVAS, source_node_id: SELECT_NODE, target_node_id: IMAGE_NODE, source_handle: null, target_handle: null }
      ],
      assets: [
        { id: IMAGE_ASSET_1, project_id: 'p1', type: 'image', url: 'canvas-assets/a.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' }
      ]
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE, model: 'qwen3-pro', medium: 'image' });

    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: SELECT_NODE, why: expect.stringContaining('non ancora') }]);
  });

  it('un select senza lista a monte (referenza rotta) non alimenta niente', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(SELECT_NODE, 'select', { index: 1 }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        { id: 'e-select-image', canvas_id: CANVAS, source_node_id: SELECT_NODE, target_node_id: IMAGE_NODE, source_handle: null, target_handle: null }
      ],
      assets: []
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE, model: 'qwen3-pro', medium: 'image' });

    expect(out.referenceImageUrls).toEqual([]);
    expect(out.rejected).toEqual([{ nodeId: SELECT_NODE, why: expect.stringContaining('non ancora') }]);
  });
});

describe('upstreamInputsFor — iterateSelection: UNA iterazione di un loop vede UN item, non la lista intera', () => {
  it('un nodeId in iterateSelection fa risolvere quella list come un select a quell\'indice, per questa sola chiamata', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(LIST_NODE, 'list', {
          item_kind: 'image',
          items: [{ label: 'a', asset_id: IMAGE_ASSET_1 }, { label: 'b', asset_id: IMAGE_ASSET_2 }]
        }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: LIST_NODE, target_node_id: IMAGE_NODE, source_handle: null, target_handle: null }
      ],
      assets: [
        { id: IMAGE_ASSET_1, project_id: 'p1', type: 'image', url: 'canvas-assets/a.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' },
        { id: IMAGE_ASSET_2, project_id: 'p1', type: 'image', url: 'canvas-assets/b.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' }
      ]
    });

    const first = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: 'qwen3-pro',
      medium: 'image',
      iterateSelection: { [LIST_NODE]: 1 }
    });
    expect(first.referenceImageUrls).toEqual(['canvas-assets/a.png']);

    const second = await upstreamInputsFor(db, {
      orgId: ORG,
      canvasId: CANVAS,
      nodeId: IMAGE_NODE,
      model: 'qwen3-pro',
      medium: 'image',
      iterateSelection: { [LIST_NODE]: 2 }
    });
    expect(second.referenceImageUrls).toEqual(['canvas-assets/b.png']);
  });

  it('senza iterateSelection, la stessa lista alimenta ancora TUTTI i suoi item (comportamento fixed, invariato)', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(LIST_NODE, 'list', {
          item_kind: 'image',
          items: [{ label: 'a', asset_id: IMAGE_ASSET_1 }, { label: 'b', asset_id: IMAGE_ASSET_2 }]
        }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '', model: 'qwen3-pro' })
      ],
      nodes_connections: [
        { id: 'e1', canvas_id: CANVAS, source_node_id: LIST_NODE, target_node_id: IMAGE_NODE, source_handle: null, target_handle: null }
      ],
      assets: [
        { id: IMAGE_ASSET_1, project_id: 'p1', type: 'image', url: 'canvas-assets/a.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' },
        { id: IMAGE_ASSET_2, project_id: 'p1', type: 'image', url: 'canvas-assets/b.png', content: null, mime_type: 'image/png', bytes: null, width: null, height: null, duration_s: null, source: 'upload', source_node_id: null, created_at: 'now' }
      ]
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE, model: 'qwen3-pro', medium: 'image' });

    expect(out.referenceImageUrls).toEqual(['canvas-assets/a.png', 'canvas-assets/b.png']);
  });
});
