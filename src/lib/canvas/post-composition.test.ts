import { describe, expect, it } from 'vitest';
import { postCompositionFor, type PostCompositionNode } from './post-composition';

function node(over: Partial<PostCompositionNode>): PostCompositionNode {
  return { id: over.id ?? 'node-1', type: over.type ?? 'image', data: over.data ?? {}, text: over.text };
}

describe('postCompositionFor: media', () => {
  it('prende immagini e video dal loro refId, nell\'ordine dato', () => {
    const result = postCompositionFor([
      node({ id: 'a', type: 'image', data: { refId: 'asset-a' } }),
      node({ id: 'v', type: 'video', data: { refId: 'asset-v' } })
    ]);

    expect(result.media).toEqual([
      { nodeId: 'a', assetId: 'asset-a' },
      { nodeId: 'v', assetId: 'asset-v' }
    ]);
  });

  it('un nodo senza risultato non porta media', () => {
    expect(postCompositionFor([node({ type: 'image', data: { running: true } })]).media).toEqual([]);
  });
});

describe('postCompositionFor: didascalie', () => {
  it('un doc porta il suo contenuto', () => {
    expect(postCompositionFor([node({ id: 'd', type: 'doc', data: { content: 'ciao mondo' } })]).captions).toEqual([
      { nodeId: 'd', text: 'ciao mondo' }
    ]);
  });

  it('un testo preferisce il testo generato al prompt', () => {
    const result = postCompositionFor([node({ id: 't', type: 'text', data: { prompt: 'scrivi' }, text: 'generato' })]);
    expect(result.captions).toEqual([{ nodeId: 't', text: 'generato' }]);
  });

  it('un testo mai generato ripiega sul prompt', () => {
    const result = postCompositionFor([node({ id: 't', type: 'text', data: { prompt: 'scrivi' } })]);
    expect(result.captions).toEqual([{ nodeId: 't', text: 'scrivi' }]);
  });

  it('un testo vuoto non è una didascalia', () => {
    expect(postCompositionFor([node({ type: 'text', data: { prompt: '  ' } })]).captions).toEqual([]);
  });
});

describe('postCompositionFor: quando si può creare un post', () => {
  it('basta un\'immagine e un testo', () => {
    const result = postCompositionFor([
      node({ id: 'a', type: 'image', data: { refId: 'x' } }),
      node({ id: 't', type: 'text', data: { prompt: 'ciao' } })
    ]);
    expect(result.enabled).toBe(true);
  });

  it('basta un solo media', () => {
    expect(postCompositionFor([node({ type: 'image', data: { refId: 'x' } })]).enabled).toBe(true);
  });

  it('basta un solo testo: alcuni social pubblicano solo testo', () => {
    expect(postCompositionFor([node({ type: 'text', data: { prompt: 'ciao' } })]).enabled).toBe(true);
  });

  it('senza media né testo non si crea niente', () => {
    expect(postCompositionFor([node({ type: 'iframe', data: { url: 'x' } })]).enabled).toBe(false);
  });
});
