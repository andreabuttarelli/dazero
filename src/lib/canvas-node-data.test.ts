import { describe, expect, it } from 'vitest';
import {
  NODE_TYPES,
  docData,
  docOf,
  frameOf,
  genOf,
  influencerOf,
  isNodeType,
  listData,
  listOf,
  newNodeRow,
  productsData,
  productsOf,
  selectData,
  selectOf,
  effectsData,
  effectsOf,
  compositionData,
  compositionOf,
  socialFeedData,
  socialFeedOf
} from '$lib/canvas-node-data';

describe('cosa una riga di `nodes` può essere', () => {
  it('i tipi che la pagina disegna, e niente che non sappia disegnare', () => {
    expect(NODE_TYPES).toEqual([
      'text',
      'image',
      'video',
      'iframe',
      'doc',
      'products',
      'social_account_feed',
      'influencer',
      'list',
      'select',
      'effects'
    ]);
  });

  it('un tipo che non è dei suoi non si riconosce', () => {
    expect(isNodeType('post')).toBe(false);
    expect(isNodeType('doc')).toBe(true);
    expect(isNodeType('text')).toBe(true);
  });
});

describe('un nodo che produce, letto dalla riga', () => {
  it('il medium è il tipo: non c`è una seconda colonna che possa contraddirlo', () => {
    const node = genOf({ id: 'n1', type: 'video', data: {} });

    expect(node).toMatchObject({ id: 'n1', medium: 'video' });
  });

  it('prompt, modello e parametri vengono da `data`', () => {
    const node = genOf({
      id: 'n1',
      type: 'image',
      data: { prompt: 'un gatto', model: 'nano-banana', params: { aspectRatio: '1:1' } }
    });

    expect(node).toMatchObject({
      prompt: 'un gatto',
      model: 'nano-banana',
      params: { aspectRatio: '1:1' }
    });
  });

  it('una riga appena nata non è una riga rotta: si legge coi suoi vuoti', () => {
    expect(genOf({ id: 'n1', type: 'text', data: {} })).toEqual({
      id: 'n1',
      medium: 'text',
      model: null,
      prompt: '',
      params: {},
      refId: null,
      runs: [],
      running: false,
      error: null
    });
  });

  it('un iframe non è un nodo che produce', () => {
    expect(genOf({ id: 'n1', type: 'iframe', data: {} })).toBeNull();
  });

  it('un `data` che mente sul tipo dei campi non rompe la pagina', () => {
    const node = genOf({ id: 'n1', type: 'image', data: { prompt: 7, model: [], params: 'no' } });

    expect(node).toMatchObject({ prompt: '', model: null, params: {} });
  });
});

describe('una pagina incorporata, letta dalla riga', () => {
  it("l'indirizzo e l'HTML vengono da `data`, e il modo lo dice quale è pieno", () => {
    expect(frameOf({ id: 'n1', type: 'iframe', data: { url: 'https://esempio.it' } })).toEqual({
      id: 'n1',
      source: 'url',
      url: 'https://esempio.it',
      html: ''
    });
  });

  it("con dell'HTML si apre sul codice", () => {
    expect(frameOf({ id: 'n1', type: 'iframe', data: { html: '<b>ciao</b>' } })).toMatchObject({
      source: 'html',
      html: '<b>ciao</b>'
    });
  });

  it('un nodo che produce non è una pagina incorporata', () => {
    expect(frameOf({ id: 'n1', type: 'text', data: {} })).toBeNull();
  });
});

describe('un documento, letto dalla riga', () => {
  it('il markdown e il flag pubblico vengono da `data`', () => {
    expect(docOf({ id: 'n1', type: 'doc', data: { content: '# Ciao', public: true } })).toEqual({
      id: 'n1',
      content: '# Ciao',
      public: true
    });
  });

  it('una riga appena nata non è una riga rotta: si legge coi suoi vuoti', () => {
    expect(docOf({ id: 'n1', type: 'doc', data: {} })).toEqual({
      id: 'n1',
      content: '',
      public: false
    });
  });

  it('un `data` che mente sul tipo dei campi non rompe la pagina', () => {
    expect(docOf({ id: 'n1', type: 'doc', data: { content: 7, public: 'si' } })).toEqual({
      id: 'n1',
      content: '',
      public: false
    });
  });

  it('un nodo che produce non è un documento', () => {
    expect(docOf({ id: 'n1', type: 'text', data: {} })).toBeNull();
    expect(docOf({ id: 'n1', type: 'iframe', data: {} })).toBeNull();
  });
});

describe('con che `data` nasce una riga', () => {
  it('un nodo che produce nasce vuoto: il modello lo sceglie chi disegna', () => {
    expect(newNodeRow('image')).toEqual({ prompt: '', model: null, params: {}, refId: null });
  });

  it("una pagina incorporata nasce sull'indirizzo, che è il caso di nove volte su dieci", () => {
    expect(newNodeRow('iframe')).toEqual({ url: '', html: '' });
  });

  it('un documento nasce vuoto e privato', () => {
    expect(newNodeRow('doc')).toEqual({ content: '', public: false });
  });

  it('un nodo products nasce su shopify e senza url: la query è da scrivere', () => {
    expect(newNodeRow('products')).toEqual({
      type: 'shopify',
      url: '',
      limit: 20,
      after: null,
      only_first_photo: false
    });
  });

  it('una lista nasce vuota, senza item_kind ancora deciso', () => {
    expect(newNodeRow('list')).toEqual({ item_kind: 'image', items: [] });
  });

  it('un select nasce a indice 1', () => {
    expect(newNodeRow('select')).toEqual({ index: 1 });
  });

  it('un nodo social_account_feed nasce su instagram e senza handle', () => {
    expect(newNodeRow('social_account_feed')).toEqual({ platform: 'instagram', handle: '', limit: 20 });
  });
});

describe('un nodo products, letto dalla riga', () => {
  it('platform, url e parametri vengono da `data`', () => {
    const node = productsOf({
      id: 'n1',
      type: 'products',
      data: { type: 'woocommerce', url: 'https://shop.example.com', limit: 50, only_first_photo: true }
    });

    expect(node).toMatchObject({
      id: 'n1',
      platform: 'woocommerce',
      url: 'https://shop.example.com',
      limit: 50,
      onlyFirstPhoto: true
    });
  });

  it('una riga appena nata non è una riga rotta: si legge coi suoi vuoti', () => {
    expect(productsOf({ id: 'n1', type: 'products', data: {} })).toEqual({
      id: 'n1',
      platform: 'shopify',
      url: '',
      limit: 20,
      after: null,
      onlyFirstPhoto: false,
      syncStatus: 'idle',
      syncError: null,
      syncedCount: 0,
      syncedAt: null
    });
  });

  it('legge lo stato di un giro fallito', () => {
    const node = productsOf({
      id: 'n1',
      type: 'products',
      data: { type: 'shopify', url: 'https://x.com', sync_status: 'failed', sync_error: 'store_unreachable: 404' }
    });
    expect(node).toMatchObject({ syncStatus: 'failed', syncError: 'store_unreachable: 404' });
  });

  it('un nodo che non è products non si legge come tale', () => {
    expect(productsOf({ id: 'n1', type: 'doc', data: {} })).toBeNull();
  });

  it('fa il giro di andata e ritorno', () => {
    const node = productsOf({
      id: 'n1',
      type: 'products',
      data: { type: 'shopify', url: 'https://x.com', limit: 10, sync_status: 'done', synced_count: 3 }
    })!;
    const written = productsData(node);
    expect(productsOf({ id: 'n1', type: 'products', data: written })).toEqual(node);
  });
});

describe('un nodo influencer, letto dalla riga', () => {
  it('influencer_id viene da `data`', () => {
    expect(influencerOf({ id: 'n1', type: 'influencer', data: { influencer_id: 'inf-1' } })).toEqual({
      id: 'n1',
      influencerId: 'inf-1'
    });
  });

  it('una riga senza influencer_id non è un nodo influencer leggibile', () => {
    expect(influencerOf({ id: 'n1', type: 'influencer', data: {} })).toBeNull();
  });

  it('un nodo che non è influencer non si legge come tale', () => {
    expect(influencerOf({ id: 'n1', type: 'doc', data: { influencer_id: 'inf-1' } })).toBeNull();
  });
});

describe('un nodo social_account_feed, letto dalla riga', () => {
  it('platform e handle vengono da `data`', () => {
    const node = socialFeedOf({ id: 'n1', type: 'social_account_feed', data: { platform: 'tiktok', handle: 'brand' } });
    expect(node).toMatchObject({ id: 'n1', platform: 'tiktok', handle: 'brand' });
  });

  it('una riga appena nata non è una riga rotta: si legge coi suoi vuoti', () => {
    expect(socialFeedOf({ id: 'n1', type: 'social_account_feed', data: {} })).toEqual({
      id: 'n1',
      platform: 'instagram',
      handle: '',
      limit: 20,
      syncStatus: 'idle',
      syncError: null,
      syncedCount: 0,
      syncedAt: null
    });
  });

  it('un nodo che non è social_account_feed non si legge come tale', () => {
    expect(socialFeedOf({ id: 'n1', type: 'products', data: {} })).toBeNull();
  });

  it('fa il giro di andata e ritorno', () => {
    const node = socialFeedOf({
      id: 'n1',
      type: 'social_account_feed',
      data: { platform: 'instagram', handle: 'brand', sync_status: 'done', synced_count: 12 }
    })!;
    const written = socialFeedData(node);
    expect(socialFeedOf({ id: 'n1', type: 'social_account_feed', data: written })).toEqual(node);
  });
});

describe('quel che di un documento si scrive', () => {
  it('fa il giro di andata e ritorno di `content` e `public`, e nient\'altro', () => {
    const node = { id: 'n1', content: '# Bozza', public: true };
    const written = docData(node);

    expect(written).toEqual({ content: '# Bozza', public: true });
    expect(docOf({ id: 'n1', type: 'doc', data: written })).toEqual(node);
  });
});

describe('un gen node porta anche il perché non è partito', () => {
  it('error arriva dal data, e mancante resta null', () => {
    expect(genOf({ id: 'n1', type: 'image', data: { error: 'render_failed' } })?.error).toBe('render_failed');
    expect(genOf({ id: 'n1', type: 'image', data: {} })?.error).toBeNull();
  });
});

describe('un nodo list, letto dalla riga', () => {
  it('item_kind e items arrivano da data', () => {
    const node = listOf({
      id: 'n1',
      type: 'list',
      data: { item_kind: 'text', items: [{ text: 'a' }, { text: 'b' }] }
    });

    expect(node).toEqual({ id: 'n1', itemKind: 'text', items: [{ text: 'a' }, { text: 'b' }] });
  });

  it('una riga appena nata non ha item_kind: legge image di riserva', () => {
    expect(listOf({ id: 'n1', type: 'list', data: {} })).toEqual({ id: 'n1', itemKind: 'image', items: [] });
  });

  it('un item_kind fuori vocabolario non si legge come vero', () => {
    expect(listOf({ id: 'n1', type: 'list', data: { item_kind: 'video', items: [] } })?.itemKind).toBe('image');
  });

  it('items non è un array: legge vuoto invece di rompersi', () => {
    expect(listOf({ id: 'n1', type: 'list', data: { items: 'boh' } })?.items).toEqual([]);
  });

  it('un nodo che non è list non si legge come tale', () => {
    expect(listOf({ id: 'n1', type: 'select', data: {} })).toBeNull();
  });

  it('fa il giro di andata e ritorno', () => {
    const node = listOf({ id: 'n1', type: 'list', data: { item_kind: 'image', items: [{ asset_id: 'a1' }] } })!;
    const written = listData(node);
    expect(listOf({ id: 'n1', type: 'list', data: written })).toEqual(node);
  });
});

describe('un nodo select, letto dalla riga', () => {
  it('index arriva da data', () => {
    expect(selectOf({ id: 'n1', type: 'select', data: { index: 3 } })).toEqual({ id: 'n1', index: 3 });
  });

  it('una riga appena nata non ha index: legge 1 di riserva', () => {
    expect(selectOf({ id: 'n1', type: 'select', data: {} })).toEqual({ id: 'n1', index: 1 });
  });

  it('un index non numerico legge 1 invece di rompersi', () => {
    expect(selectOf({ id: 'n1', type: 'select', data: { index: 'due' } })?.index).toBe(1);
  });

  it('un nodo che non è select non si legge come tale', () => {
    expect(selectOf({ id: 'n1', type: 'list', data: {} })).toBeNull();
  });

  it('fa il giro di andata e ritorno', () => {
    const node = selectOf({ id: 'n1', type: 'select', data: { index: 5 } })!;
    const written = selectData(node);
    expect(selectOf({ id: 'n1', type: 'select', data: written })).toEqual(node);
  });
});

describe('un nodo effects, letto dalla riga', () => {
  it('una riga appena nata non ha effetti: legge una pila vuota di riserva', () => {
    expect(effectsOf({ id: 'n1', type: 'effects', data: {} })).toEqual({
      id: 'n1',
      effects: [],
      refId: null,
      sourceRefId: null
    });
  });

  it('la pila, il refId e il sourceRefId arrivano da data', () => {
    expect(
      effectsOf({
        id: 'n1',
        type: 'effects',
        data: { effects: [{ id: 'pixelate', params: { blockSize: 8 } }], refId: 'a1', sourceRefId: 'a0' }
      })
    ).toEqual({
      id: 'n1',
      effects: [{ id: 'pixelate', params: { blockSize: 8 }, enabled: true }],
      refId: 'a1',
      sourceRefId: 'a0'
    });
  });

  it('un passo spento resta spento', () => {
    const node = effectsOf({
      id: 'n1',
      type: 'effects',
      data: { effects: [{ id: 'pixelate', params: {}, enabled: false }] }
    });
    expect(node?.effects[0].enabled).toBe(false);
  });

  it('un effetto sconosciuto sparisce dalla pila invece di rompere il disegno', () => {
    const node = effectsOf({
      id: 'n1',
      type: 'effects',
      data: { effects: [{ id: 'pixelate', params: {} }, { id: 'not-a-real-effect', params: {} }] }
    })!;
    expect(node.effects).toEqual([{ id: 'pixelate', params: {}, enabled: true }]);
  });

  it('un nodo che non è effects non si legge come tale', () => {
    expect(effectsOf({ id: 'n1', type: 'image', data: {} })).toBeNull();
  });

  it('fa il giro di andata e ritorno', () => {
    const node = effectsOf({
      id: 'n1',
      type: 'effects',
      data: { effects: [{ id: 'posterize', params: { levels: 4 } }], refId: 'a1', sourceRefId: 'a0' }
    })!;
    const written = effectsData(node);
    expect(effectsOf({ id: 'n1', type: 'effects', data: written })).toEqual(node);
  });
});

describe('un nodo composition, letto dalla riga', () => {
  it('una riga appena nata prende i default: primo layout, prima camera, sfondo nero', () => {
    expect(compositionOf({ id: 'n1', type: 'composition', data: {} })).toEqual({
      id: 'n1',
      layout: 'tilted-grid',
      layoutParams: {},
      camera: { preset: 'static', params: {} },
      background: { color: '#000000' },
      duration: 6,
      aspect: '9:16',
      refId: null
    });
  });

  it('un layout o preset sconosciuto in data torna al default invece di rompere il disegno', () => {
    const node = compositionOf({
      id: 'n1',
      type: 'composition',
      data: { layout: 'not-a-layout', camera: { preset: 'not-a-preset' } }
    })!;
    expect(node.layout).toBe('tilted-grid');
    expect(node.camera.preset).toBe('static');
  });

  it('un nodo che non è composition non si legge come tale', () => {
    expect(compositionOf({ id: 'n1', type: 'image', data: {} })).toBeNull();
  });

  it('fa il giro di andata e ritorno', () => {
    const node = compositionOf({
      id: 'n1',
      type: 'composition',
      data: {
        layout: 'carousel-3d',
        layoutParams: { count: 5 },
        camera: { preset: 'slow-orbit', params: { radius: 10 } },
        background: { color: '#112233' },
        duration: 8,
        aspect: '1:1',
        refId: 'a1'
      }
    })!;
    const written = compositionData(node);
    expect(compositionOf({ id: 'n1', type: 'composition', data: written })).toEqual(node);
  });
});
