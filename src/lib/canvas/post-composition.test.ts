import { describe, expect, it } from 'vitest';
import { postCompositionFor, type PostCompositionNode } from './post-composition';

function node(over: Partial<PostCompositionNode>): PostCompositionNode {
  return { id: over.id ?? 'node-1', type: over.type ?? 'image', data: over.data ?? {} };
}

describe('postCompositionFor: media', () => {
  it('collects an uploaded image node by data.assetId, in the given order', () => {
    const nodes = [
      node({ id: 'a', type: 'image', data: { assetId: 'asset-a' } }),
      node({ id: 'b', type: 'image', data: { assetId: 'asset-b' } })
    ];

    const result = postCompositionFor(nodes);

    expect(result.media).toEqual([
      { nodeId: 'a', assetId: 'asset-a' },
      { nodeId: 'b', assetId: 'asset-b' }
    ]);
  });

  it('collects a generated video node by data.output_asset_id, only when status is done', () => {
    const nodes = [node({ id: 'v', type: 'video', data: { status: 'done', output_asset_id: 'gen-1' } })];

    const result = postCompositionFor(nodes);

    expect(result.media).toEqual([{ nodeId: 'v', assetId: 'gen-1' }]);
  });

  it('a node still generating contributes no media', () => {
    const nodes = [node({ id: 'v', type: 'video', data: { status: 'running' } })];

    const result = postCompositionFor(nodes);

    expect(result.media).toEqual([]);
  });
});

describe('postCompositionFor: captions', () => {
  it('a doc node contributes its content as a caption candidate', () => {
    const nodes = [node({ id: 'd', type: 'doc', data: { content: 'ciao mondo' } })];

    const result = postCompositionFor(nodes);

    expect(result.captions).toEqual([{ nodeId: 'd', text: 'ciao mondo' }]);
  });

  it('a text node prefers its generated output over the prompt', () => {
    const nodes = [
      node({ id: 't', type: 'text', data: { status: 'done', output_text: 'testo generato', prompt: 'scrivi qualcosa' } })
    ];

    const result = postCompositionFor(nodes);

    expect(result.captions).toEqual([{ nodeId: 't', text: 'testo generato' }]);
  });

  it('a text node not yet generated falls back to its prompt', () => {
    const nodes = [node({ id: 't', type: 'text', data: { status: 'running', prompt: 'scrivi qualcosa' } })];

    const result = postCompositionFor(nodes);

    expect(result.captions).toEqual([{ nodeId: 't', text: 'scrivi qualcosa' }]);
  });
});

describe('postCompositionFor: enabled', () => {
  it('is enabled when at least one node contributes media', () => {
    const nodes = [node({ id: 'a', type: 'image', data: { assetId: 'asset-a' } })];

    expect(postCompositionFor(nodes).enabled).toBe(true);
  });

  it('is disabled when no node contributes media, even with a caption', () => {
    const nodes = [node({ id: 'd', type: 'doc', data: { content: 'testo soltanto' } })];

    expect(postCompositionFor(nodes).enabled).toBe(false);
  });

  it('is disabled with no nodes at all', () => {
    expect(postCompositionFor([]).enabled).toBe(false);
  });
});
