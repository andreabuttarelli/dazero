import { describe, expect, it, vi } from 'vitest';
import { promoteNodesToPost } from './post-from-nodes';

const ORG = 'org-1';
const BRAND = 'brand-1';
const FAKE_DB = {} as never;

function node(over: Partial<{ id: string; type: string; x: number; y: number; data: Record<string, unknown> }>) {
  return {
    id: over.id ?? 'node-1',
    canvasId: 'canvas-1',
    projectId: 'proj-1',
    type: over.type ?? 'image',
    displayName: null,
    position: { x: over.x ?? 0, y: over.y ?? 0, z: 0 },
    size: { width: null, height: null },
    data: over.data ?? {},
    version: 1
  };
}

function fakeCanvasRepo(nodes: ReturnType<typeof node>[]) {
  return { listNodesByIds: vi.fn().mockResolvedValue(nodes) };
}

function fakePostsRepo(post: { id: string } = { id: 'post-1' }) {
  return { promoteToPost: vi.fn().mockResolvedValue(post) };
}

describe('promoteNodesToPost: ordine di lettura', () => {
  it('ordina i media per posizione, alto-basso poi sinistra-destra', async () => {
    const nodes = [
      node({ id: 'bottom', type: 'image', y: 100, x: 0, data: { assetId: 'asset-bottom' } }),
      node({ id: 'top-right', type: 'image', y: 0, x: 100, data: { assetId: 'asset-top-right' } }),
      node({ id: 'top-left', type: 'image', y: 0, x: 0, data: { assetId: 'asset-top-left' } })
    ];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(
      FAKE_DB,
      { canvas: canvasRepo, posts: postsRepo },
      { orgId: ORG, brandId: BRAND, nodeIds: ['bottom', 'top-right', 'top-left'] }
    );

    expect(postsRepo.promoteToPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        media: [
          { assetId: 'asset-top-left', order: 0, role: 'media' },
          { assetId: 'asset-top-right', order: 1, role: 'media' },
          { assetId: 'asset-bottom', order: 2, role: 'media' }
        ]
      })
    );
  });
});

describe('promoteNodesToPost: risoluzione asset per tipo di nodo', () => {
  it('un nodo caricato prende data.assetId', async () => {
    const nodes = [node({ type: 'image', data: { assetId: 'uploaded-1' } })];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['node-1'] });

    expect(postsRepo.promoteToPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ media: [{ assetId: 'uploaded-1', order: 0, role: 'media' }] })
    );
  });

  it('un nodo generato prende data.output_asset_id, solo se lo stato e done', async () => {
    const nodes = [node({ type: 'video', data: { status: 'done', output_asset_id: 'generated-1' } })];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['node-1'] });

    expect(postsRepo.promoteToPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ media: [{ assetId: 'generated-1', order: 0, role: 'media' }] })
    );
  });

  it('un nodo generato ancora in corso non porta media, non un id vuoto', async () => {
    const nodes = [node({ type: 'video', data: { status: 'running' } })];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['node-1'] });

    expect(postsRepo.promoteToPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ media: [] }));
  });

  it('un nodo testo o doc alimenta la caption, non i media', async () => {
    const nodes = [
      node({ id: 'text-1', type: 'text', data: { prompt: 'ciao', status: 'done', output_asset_id: 'text-asset' } }),
      node({ id: 'img-1', type: 'image', y: 10, data: { assetId: 'asset-1' } })
    ];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['text-1', 'img-1'] });

    const call = postsRepo.promoteToPost.mock.calls[0][1];
    expect(call.media).toEqual([{ assetId: 'asset-1', order: 0, role: 'media' }]);
  });

  it('un nodo doc alimenta la caption dal suo content', async () => {
    const nodes = [node({ id: 'doc-1', type: 'doc', data: { content: 'testo del documento', public: false } })];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['doc-1'] });

    expect(postsRepo.promoteToPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ caption: 'testo del documento' }));
  });

  it('una caption esplicita sostituisce quella dei nodi, che restano sorgenti', async () => {
    const nodes = [
      node({ id: 'doc-1', type: 'doc', data: { content: 'testo del documento' } }),
      node({ id: 'img-1', type: 'image', y: 10, data: { assetId: 'asset-1' } })
    ];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(
      FAKE_DB,
      { canvas: canvasRepo, posts: postsRepo },
      { orgId: ORG, brandId: BRAND, nodeIds: ['doc-1', 'img-1'], caption: 'la caption scelta dall utente' }
    );

    const call = postsRepo.promoteToPost.mock.calls[0][1];
    expect(call.caption).toBe('la caption scelta dall utente');
    expect(call.sources).toEqual([
      { nodeId: 'doc-1', role: 'caption' },
      { nodeId: 'img-1', role: 'media' }
    ]);
  });
});

describe('promoteNodesToPost: post_sources', () => {
  it('registra ogni nodo come sorgente, con il ruolo giusto', async () => {
    const nodes = [
      node({ id: 'text-1', type: 'text', data: { prompt: 'ciao', status: 'done', output_asset_id: 'text-asset' } }),
      node({ id: 'img-1', type: 'image', data: { assetId: 'asset-1' } })
    ];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['text-1', 'img-1'] });

    expect(postsRepo.promoteToPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sources: [
          { nodeId: 'text-1', role: 'caption' },
          { nodeId: 'img-1', role: 'media' }
        ]
      })
    );
  });
});

describe('promoteNodesToPost: tenancy', () => {
  it('un id che non appartiene a questa org non entra nel post', async () => {
    const nodes = [node({ id: 'mine', type: 'image', data: { assetId: 'asset-1' } })];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await expect(
      promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['mine', 'not-mine'] })
    ).rejects.toThrow(/not-mine/);
  });

  it('listNodesByIds si chiama con l orgId del chiamante, non un altro', async () => {
    const nodes = [node({ id: 'node-1', data: { assetId: 'a1' } })];
    const canvasRepo = fakeCanvasRepo(nodes);
    const postsRepo = fakePostsRepo();

    await promoteNodesToPost(FAKE_DB, { canvas: canvasRepo, posts: postsRepo }, { orgId: ORG, brandId: BRAND, nodeIds: ['node-1'] });

    expect(canvasRepo.listNodesByIds).toHaveBeenCalledWith(expect.anything(), { orgId: ORG, nodeIds: ['node-1'] });
  });
});
