import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { Db } from '$lib/server/db/client';
import { applyEffectsNode } from './apply-effects';

const orgId = 'org-1';
const nodeId = 'node-1';
const actor = { kind: 'user' as const, id: 'user-1' };

async function tinyPng(): Promise<Buffer> {
  const width = 8;
  const height = 8;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = (x + y) % 2 === 0;
      data[i] = on ? 255 : 0;
      data[i + 1] = on ? 0 : 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function fakeDb(input: {
  node: Record<string, unknown> | null;
  sourceAsset: Record<string, unknown> | null;
  inputBytes: Buffer | null;
}) {
  const nodesTable = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({ data: input.node, error: null })
          })
        })
      })
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => {
                if (!input.node) return { data: null, error: null };
                const merged = { ...input.node, ...patch };
                return { data: merged, error: null };
              }
            })
          })
        })
      })
    })
  };

  const assetsTable = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: input.sourceAsset, error: null })
        })
      })
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: { id: 'asset-out', ...row, created_at: 'now' },
          error: null
        })
      })
    })
  };

  const canvasEventsTable = {
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'event-1' }, error: null }) }) })
  };

  const from = vi.fn((table: string) => {
    if (table === 'nodes') return nodesTable;
    if (table === 'assets') return assetsTable;
    if (table === 'canvas_events') return canvasEventsTable;
    throw new Error(`unexpected table ${table}`);
  });

  const storage = {
    from: () => ({
      download: async () =>
        input.inputBytes
          ? { data: new Blob([new Uint8Array(input.inputBytes)]), error: null }
          : { data: null, error: new Error('not found') },
      upload: vi.fn(async () => ({ error: null }))
    })
  };

  return { db: { from, storage } as unknown as Db };
}

const baseNode = {
  id: nodeId,
  org_id: orgId,
  canvas_id: 'canvas-1',
  project_id: 'project-1',
  type: 'effects',
  display_name: null,
  x: 0,
  y: 0,
  z: 0,
  width: null,
  height: null,
  data: { effects: [{ id: 'pixelate', params: { blockSize: 4 }, enabled: true }], sourceRefId: 'asset-in', refId: null },
  version: 1
};

const sourceAssetRow = {
  id: 'asset-in',
  project_id: 'project-1',
  type: 'image',
  url: 'org-1/project-1/source.png',
  content: null,
  mime_type: 'image/png',
  bytes: 100,
  width: 8,
  height: 8,
  duration_s: null,
  source: 'upload',
  source_node_id: null,
  created_at: 'now'
};

describe('applyEffectsNode', () => {
  it('applica la pila e scrive refId sul nodo, con un PNG delle stesse dimensioni', async () => {
    const inputBytes = await tinyPng();
    const { db } = fakeDb({ node: baseNode, sourceAsset: sourceAssetRow, inputBytes });

    const result = await applyEffectsNode(db, { orgId, nodeId, actor });

    expect(result.outcome).toBe('applied');
    if (result.outcome !== 'applied') return;

    expect(result.asset.width).toBe(8);
    expect(result.asset.height).toBe(8);

    const outMeta = await sharp(result.pngBytes).metadata();
    expect(outMeta.width).toBe(8);
    expect(outMeta.height).toBe(8);
    expect(outMeta.format).toBe('png');

    const inMeta = await sharp(inputBytes).ensureAlpha().raw().toBuffer();
    const outRaw = await sharp(result.pngBytes).ensureAlpha().raw().toBuffer();
    expect(Buffer.compare(inMeta, outRaw)).not.toBe(0);
  });

  it('nessun sourceRefId: errore chiaro, non un crash', async () => {
    const node = { ...baseNode, data: { effects: [], sourceRefId: null, refId: null } };
    const { db } = fakeDb({ node, sourceAsset: null, inputBytes: null });

    const result = await applyEffectsNode(db, { orgId, nodeId, actor });

    expect(result.outcome).toBe('refused');
    if (result.outcome === 'refused') {
      expect(result.error).toMatch(/sourceRefId|sorgente/i);
    }
  });

  it('nodo inesistente: errore chiaro', async () => {
    const { db } = fakeDb({ node: null, sourceAsset: null, inputBytes: null });
    const result = await applyEffectsNode(db, { orgId, nodeId, actor });
    expect(result.outcome).toBe('refused');
  });
});
