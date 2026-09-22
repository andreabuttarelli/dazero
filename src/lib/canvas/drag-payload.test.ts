import { describe, expect, it } from 'vitest';
import {
  DRAG_NODE_KIND,
  assetDrag,
  brandFieldDrag,
  parseFilledNodeDrag,
  serializeFilledNodeDrag,
  staticDocData,
  staticMediaData,
  staticTextData
} from './drag-payload';
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

  it('serializeFilledNodeDrag/parseFilledNodeDrag fanno un giro completo', () => {
    const drag = { type: 'image' as const, data: staticMediaData({ assetId: 'a1', url: '/x', name: 'n', mimeType: 'image/png' }), w: 320, h: 240 };
    expect(parseFilledNodeDrag(serializeFilledNodeDrag(drag))).toEqual(drag);
  });

  it('parseFilledNodeDrag rifiuta un JSON non nella forma attesa', () => {
    expect(parseFilledNodeDrag('non è json')).toBeNull();
    expect(parseFilledNodeDrag('{}')).toBeNull();
    expect(parseFilledNodeDrag(JSON.stringify({ type: 'audio', data: {}, w: 1, h: 1 }))).toBeNull();
    expect(parseFilledNodeDrag(JSON.stringify({ type: 'image', data: {} }))).toBeNull();
  });

  describe('assetDrag: lo stesso pacchetto per la libreria del progetto e la barra laterale', () => {
    it('un\'immagine diventa un nodo image, con l\'url firmato dentro', () => {
      const drag = assetDrag({ type: 'image', id: 'a1', signedUrl: '/signed', url: 'store/x.png', mimeType: 'image/png', content: null });
      expect(drag?.type).toBe('image');
      expect(drag?.data).toMatchObject({ assetId: 'a1', url: '/signed', mimeType: 'image/png' });
      expect(validateNodeData('image', drag!.data).ok).toBe(true);
    });

    it('un video diventa un nodo video, un documento un nodo doc col suo content', () => {
      const video = assetDrag({ type: 'video', id: 'v1', signedUrl: '/signed.mp4', url: 'store/x.mp4', mimeType: 'video/mp4', content: null });
      expect(video?.type).toBe('video');

      const doc = assetDrag({ type: 'document', id: 'd1', signedUrl: null, url: null, mimeType: null, content: '# Titolo' });
      expect(doc?.type).toBe('doc');
      expect(validateNodeData('doc', doc!.data)).toEqual({ ok: true, data: { content: '# Titolo', public: false } });
    });

    it('un asset senza url firmato non si trascina: non c\'è niente da mettere nel nodo', () => {
      expect(assetDrag({ type: 'image', id: 'a1', signedUrl: null, url: 'store/x.png', mimeType: 'image/png', content: null })).toBeNull();
    });

    it('un tipo che non ha un nodo statico (testo generato, ad esempio) non si trascina', () => {
      expect(assetDrag({ type: 'text', id: 't1', signedUrl: null, url: null, mimeType: null, content: 'ciao' })).toBeNull();
    });
  });

  describe('brandFieldDrag: lo stesso pacchetto per la pagina brand e la barra laterale', () => {
    const brand = {
      name: 'Acme',
      logoAssetId: 'logo1',
      logoUrl: '/logo.png',
      shortDescription: 'Fa cose',
      content: 'Contenuto lungo del brand'
    };

    it('il logo diventa un nodo image con lo stesso assetId', () => {
      const drag = brandFieldDrag(brand, 'logo');
      expect(drag?.type).toBe('image');
      expect(drag?.data).toMatchObject({ assetId: 'logo1' });
    });

    it('i testi diventano il prompt di un nodo text: nome e descrizione insieme', () => {
      const drag = brandFieldDrag(brand, 'text');
      expect(drag?.type).toBe('text');
      expect(drag?.data.prompt).toBe('Acme\n\nFa cose');
    });

    it('il content diventa un nodo doc', () => {
      const drag = brandFieldDrag(brand, 'content');
      expect(drag?.type).toBe('doc');
      expect(drag?.data).toMatchObject({ content: 'Contenuto lungo del brand' });
    });

    it('un logo assente non si trascina', () => {
      expect(brandFieldDrag({ ...brand, logoAssetId: null }, 'logo')).toBeNull();
    });

    it('un content assente non si trascina: non c\'è niente da mettere nel documento', () => {
      expect(brandFieldDrag({ ...brand, content: null }, 'content')).toBeNull();
    });
  });
});
