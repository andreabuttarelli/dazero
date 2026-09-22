import { describe, expect, it } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';
import { upstreamInputsFor } from './upstream';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANVAS = '22222222-2222-2222-2222-222222222222';
const TEXT_NODE = '33333333-3333-3333-3333-333333333333';
const IMAGE_NODE = '44444444-4444-4444-4444-444444444444';
const ASSET = '55555555-5555-5555-5555-555555555555';

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

describe('upstreamInputsFor — dal database alla forma pura', () => {
  it('legge il testo dell\'ultimo giro di un nodo testo attraverso il suo asset', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(TEXT_NODE, 'text', { prompt: 'scrivi qualcosa', refId: ASSET }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '' })
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

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE });

    expect(out.text).toEqual(['ciao mondo']);
  });

  it('legge il `content` di un `doc` senza passare da un asset', async () => {
    const { db } = fakeDb({
      nodes: [
        nodeRow(TEXT_NODE, 'doc', { content: 'appunti', public: false }),
        nodeRow(IMAGE_NODE, 'image', { prompt: '' })
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

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE });

    expect(out.text).toEqual(['appunti']);
  });

  it('un nodo senza archi in ingresso non riceve niente', async () => {
    const { db } = fakeDb({
      nodes: [nodeRow(IMAGE_NODE, 'image', { prompt: '' })],
      nodes_connections: [],
      assets: []
    });

    const out = await upstreamInputsFor(db, { orgId: ORG, canvasId: CANVAS, nodeId: IMAGE_NODE });

    expect(out).toMatchObject({ text: [], referenceImageUrls: [], rejected: [] });
  });
});
