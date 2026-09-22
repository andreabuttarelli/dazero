import { describe, expect, it } from 'vitest';
import { DRAG_NODE_KIND, staticDocData, staticMediaData, staticTextData } from './drag-payload';
import { validateNodeData } from './node-data';

describe('cosa diventa un nodo trascinato da fuori la tela', () => {
  it('un asset immagine diventa un nodo image, un video un nodo video, un documento un nodo doc', () => {
    expect(DRAG_NODE_KIND.asset.image).toBe('image');
    expect(DRAG_NODE_KIND.asset.video).toBe('video');
    expect(DRAG_NODE_KIND.asset.document).toBe('doc');
  });

  it('il logo del brand diventa un nodo image, i suoi testi un nodo text, il content un nodo doc', () => {
    expect(DRAG_NODE_KIND.brand.logo).toBe('image');
    expect(DRAG_NODE_KIND.brand.text).toBe('text');
    expect(DRAG_NODE_KIND.brand.content).toBe('doc');
  });

  it('staticMediaData supera il CHECK di image/video: solo prompt è richiesto, e resta vuoto', () => {
    const data = staticMediaData({ assetId: 'a1', url: '/x', name: 'logo.png', mimeType: 'image/png' });
    expect(validateNodeData('image', data).ok).toBe(true);
    expect(validateNodeData('video', data).ok).toBe(true);
    expect(data.prompt).toBe('');
    expect(data.assetId).toBe('a1');
  });

  it('staticTextData supera il CHECK di text: il testo trascinato diventa il prompt', () => {
    const data = staticTextData('Ciao');
    expect(validateNodeData('text', data)).toEqual({ ok: true, data });
  });

  it('staticDocData supera il CHECK di doc: content e public, mai pubblico di default', () => {
    const data = staticDocData('# Titolo');
    expect(validateNodeData('doc', data)).toEqual({ ok: true, data });
    expect(data.public).toBe(false);
  });
});
