import { describe, expect, it } from 'vitest';
import {
  NODE_DATA_SCHEMAS,
  NODE_TYPES,
  describeNodeType,
  describeNodeTypes,
  looseNodeJsonSchema,
  validateNodeData,
  type NodeType
} from './node-data';

const GEN_STATE = { status: 'idle' as const };

describe('NODE_DATA_SCHEMAS — una riga per tipo, tutti i 10 valori di nodes_type_check coperti', () => {
  it('ha esattamente i 10 tipi che il CHECK del database ammette', () => {
    const types = Object.keys(NODE_DATA_SCHEMAS).sort();
    expect(types).toEqual(
      [
        'ads',
        'doc',
        'iframe',
        'image',
        'influencer',
        'list',
        'products',
        'select',
        'social_account_feed',
        'social_post_mockup',
        'text',
        'video'
      ].sort()
    );
  });
});

describe('validateNodeData — text', () => {
  it('accetta un nodo minimo valido', () => {
    const out = validateNodeData('text', { prompt: 'scrivi qualcosa', ...GEN_STATE });
    expect(out.ok).toBe(true);
  });

  it('rifiuta un prompt mancante e dice quale campo manca', () => {
    const out = validateNodeData('text', { model: 'gpt-5' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/prompt/);
  });
});

describe('validateNodeData — image', () => {
  it('accetta prompt + aspect_ratio + stato idle', () => {
    const out = validateNodeData('image', { prompt: 'un gatto', aspect_ratio: '1:1', ...GEN_STATE });
    expect(out.ok).toBe(true);
  });

  it('rifiuta uno status fuori dall\'enum e nomina il campo', () => {
    const out = validateNodeData('image', { prompt: 'x', status: 'in_progress' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/status/);
  });

  it('non richiede aspect_ratio: i formati vivono nel catalogo del modello, non qui', () => {
    const out = validateNodeData('image', { prompt: 'x', ...GEN_STATE });
    expect(out.ok).toBe(true);
  });
});

describe('validateNodeData — video', () => {
  it('accetta prompt + audio + stato', () => {
    const out = validateNodeData('video', { prompt: 'un cane che corre', audio: true, ...GEN_STATE });
    expect(out.ok).toBe(true);
  });

  it('rifiuta audio non booleano', () => {
    const out = validateNodeData('video', { prompt: 'x', audio: 'yes' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/audio/);
  });
});

describe('validateNodeData — doc', () => {
  it('accetta content + public', () => {
    const out = validateNodeData('doc', { content: '# titolo', public: false });
    expect(out.ok).toBe(true);
  });

  it('rifiuta public non booleano', () => {
    const out = validateNodeData('doc', { content: 'x', public: 'no' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/public/);
  });

  it('content vuoto è ammesso: un doc appena nato è vuoto', () => {
    const out = validateNodeData('doc', { content: '', public: false });
    expect(out.ok).toBe(true);
  });
});

describe('validateNodeData — iframe', () => {
  it('accetta il modo url', () => {
    const out = validateNodeData('iframe', { url: 'https://example.com' });
    expect(out.ok).toBe(true);
  });

  it('accetta il modo content (l\'html incorporato)', () => {
    const out = validateNodeData('iframe', { content: '<div>ciao</div>' });
    expect(out.ok).toBe(true);
  });

  it('rifiuta uno schema javascript: nell\'url — stessa regola di iframe-node.ts', () => {
    const out = validateNodeData('iframe', { url: 'javascript:alert(1)' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/url/);
  });

  it('rifiuta uno schema data: nell\'url', () => {
    const out = validateNodeData('iframe', { url: 'data:text/html,<script>1</script>' });
    expect(out.ok).toBe(false);
  });
});

describe('validateNodeData — social_account_feed', () => {
  it('accetta platform + handle', () => {
    const out = validateNodeData('social_account_feed', { platform: 'instagram', handle: 'brand', limit: 20 });
    expect(out.ok).toBe(true);
  });

  it('rifiuta una piattaforma fuori dall\'elenco di social_accounts_platform_check', () => {
    const out = validateNodeData('social_account_feed', { platform: 'myspace', handle: 'brand' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/platform/);
  });

  it('rifiuta un handle mancante e lo nomina', () => {
    const out = validateNodeData('social_account_feed', { platform: 'instagram' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/handle/);
  });

  it('accetta lo stato di sincronizzazione scritto dal giro', () => {
    const out = validateNodeData('social_account_feed', {
      platform: 'instagram',
      handle: 'brand',
      sync_status: 'done',
      synced_count: 12,
      synced_at: '2026-09-22T00:00:00Z'
    });
    expect(out.ok).toBe(true);
  });
});

describe('validateNodeData — social_post_mockup', () => {
  it('accetta la struttura annidata general/x/threads', () => {
    const out = validateNodeData('social_post_mockup', {
      general: { caption: 'ciao', media: [], first_comment: null },
      x: { posts: [{ caption: 'x1', media: [] }] },
      threads: { posts: [] }
    });
    expect(out.ok).toBe(true);
  });

  it('accetta un mockup vuoto: nasce così prima di essere scritto', () => {
    const out = validateNodeData('social_post_mockup', {});
    expect(out.ok).toBe(true);
  });

  it('rifiuta general.caption non stringa', () => {
    const out = validateNodeData('social_post_mockup', { general: { caption: 42 } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/general/);
  });
});

describe('validateNodeData — products', () => {
  it('accetta shopify', () => {
    const out = validateNodeData('products', { type: 'shopify', url: 'https://shop.example.com' });
    expect(out.ok).toBe(true);
  });

  it('accetta woocommerce', () => {
    const out = validateNodeData('products', { type: 'woocommerce', url: 'https://shop.example.com' });
    expect(out.ok).toBe(true);
  });

  it('rifiuta una piattaforma fuori da products_platform_check', () => {
    const out = validateNodeData('products', { type: 'magento', url: 'https://shop.example.com' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/type/);
  });

  it('accetta lo stato di sincronizzazione scritto dal giro (sync_status, sync_error, synced_count, synced_at)', () => {
    const out = validateNodeData('products', {
      type: 'shopify',
      url: 'https://shop.example.com',
      sync_status: 'failed',
      sync_error: 'store_unreachable: /products.json returned 404',
      synced_count: 0,
      synced_at: null
    });
    expect(out.ok).toBe(true);
  });
});

describe('validateNodeData — ads: country obbligatorio, due modi mutuamente esclusivi', () => {
  it('accetta mode=page con page_id e country', () => {
    const out = validateNodeData('ads', { mode: 'page', page_id: '1234567', country: 'IT' });
    expect(out.ok).toBe(true);
  });

  it('accetta mode=search con search_terms e country', () => {
    const out = validateNodeData('ads', { mode: 'search', search_terms: 'scarpe running', country: 'IT' });
    expect(out.ok).toBe(true);
  });

  it('rifiuta country mancante, in ENTRAMBI i modi', () => {
    const page = validateNodeData('ads', { mode: 'page', page_id: '123' });
    expect(page.ok).toBe(false);
    if (!page.ok) expect(page.error).toMatch(/country/);

    const search = validateNodeData('ads', { mode: 'search', search_terms: 'x' });
    expect(search.ok).toBe(false);
    if (!search.ok) expect(search.error).toMatch(/country/);
  });

  it('rifiuta mode=page senza page_id', () => {
    const out = validateNodeData('ads', { mode: 'page', country: 'IT' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/page_id/);
  });

  it('rifiuta mode=search senza search_terms', () => {
    const out = validateNodeData('ads', { mode: 'search', country: 'IT' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/search_terms/);
  });

  it('rifiuta mode=page con search_terms valorizzato: i due modi sono mutuamente esclusivi', () => {
    const out = validateNodeData('ads', { mode: 'page', page_id: '123', search_terms: 'x', country: 'IT' });
    expect(out.ok).toBe(false);
  });
});

describe('validateNodeData — influencer', () => {
  it('accetta il solo campo required', () => {
    const out = validateNodeData('influencer', { influencer_id: '737f5c5c-0466-46d7-9557-706614ad2b3b' });
    expect(out.ok).toBe(true);
  });

  it('rifiuta un nodo senza influencer_id', () => {
    const out = validateNodeData('influencer', {});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/influencer_id/);
  });
});

describe('validateNodeData — list', () => {
  it('accetta una lista vuota (nasce vuota, si riempie dopo)', () => {
    const out = validateNodeData('list', { item_kind: 'image', items: [] });
    expect(out.ok).toBe(true);
  });

  it('accetta immagini con asset_id', () => {
    const out = validateNodeData('list', {
      item_kind: 'image',
      items: [{ label: 'modello 1', asset_id: 'a1' }, { label: 'modello 2', asset_id: 'a2' }]
    });
    expect(out.ok).toBe(true);
  });

  it('accetta testo con text', () => {
    const out = validateNodeData('list', {
      item_kind: 'text',
      items: [{ label: 'riga 1', text: 'ciao' }]
    });
    expect(out.ok).toBe(true);
  });

  it('rifiuta item_kind mancante', () => {
    const out = validateNodeData('list', { items: [] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/item_kind/);
  });

  it('rifiuta un item_kind fuori enum', () => {
    const out = validateNodeData('list', { item_kind: 'video', items: [] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/item_kind/);
  });
});

describe('validateNodeData — select', () => {
  it('accetta un index 1-based', () => {
    const out = validateNodeData('select', { index: 1 });
    expect(out.ok).toBe(true);
  });

  it('rifiuta index mancante', () => {
    const out = validateNodeData('select', {});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/index/);
  });

  it('rifiuta index zero o negativo: 1-based, non 0-based', () => {
    const zero = validateNodeData('select', { index: 0 });
    expect(zero.ok).toBe(false);

    const negative = validateNodeData('select', { index: -1 });
    expect(negative.ok).toBe(false);
  });
});

describe('validateNodeData — un tipo sconosciuto è rifiutato, non passa silenziosamente', () => {
  it('un type fuori da nodes_type_check torna un errore che lo nomina', () => {
    const out = validateNodeData('carousel' as NodeType, {});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/carousel/);
  });
});

describe('describeNodeType / describeNodeTypes — la forma verso l\'esterno, derivata dallo stesso schema', () => {
  it('descrive un singolo tipo come JSON Schema, con le sue proprietà nominate', () => {
    const shape = describeNodeType('ads');
    expect(shape).toHaveProperty('properties');
    const props = (shape as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['mode', 'country', 'page_id', 'search_terms']));
  });

  it('non ripete $schema — nessun client lo legge, come tool-surface-cost.test.ts chiede altrove', () => {
    const shape = describeNodeType('text');
    expect(shape).not.toHaveProperty('$schema');
  });

  it('copre tutti e dieci i tipi, la stessa lista di NODE_TYPES', () => {
    const all = describeNodeTypes();
    expect(Object.keys(all).sort()).toEqual([...NODE_TYPES].sort());
  });
});

describe('looseNodeJsonSchema — solo required + enum del discriminante, per il CHECK del database', () => {
  it('tiene solo i campi required, non gli opzionali', () => {
    const shape = looseNodeJsonSchema('image');
    expect(Object.keys((shape as { properties: Record<string, unknown> }).properties)).toEqual(['prompt']);
  });

  it('tiene l\'enum di un campo required (products.type) — un vero invariante, non un vincolo che stringe', () => {
    const shape = looseNodeJsonSchema('products') as { properties: Record<string, { enum?: string[] }> };
    expect(shape.properties.type.enum).toEqual(['shopify', 'woocommerce']);
  });

  it('non porta minLength/format/tetti numerici — quelli restano solo nello schema completo', () => {
    const loose = JSON.stringify(looseNodeJsonSchema('ads'));
    expect(loose).not.toMatch(/minLength|format|exclusiveMinimum/);

    const full = JSON.stringify(describeNodeType('ads'));
    expect(full).toMatch(/minLength/);
  });

  it('un tipo senza campi required (iframe) torna required: []', () => {
    const shape = looseNodeJsonSchema('iframe') as { required: string[] };
    expect(shape.required).toEqual([]);
  });
});

describe('un media trascinato sulla tela nasce con il suo file', () => {
  it('un\'immagine o un video dalla libreria tiene assetId, nome e tipo', async () => {
    const { staticMediaData } = await import('./drag-payload');
    const data = staticMediaData({ assetId: 'asset-1', url: 'https://signed/x.png', name: 'x.png', mimeType: 'image/png' });
    for (const type of ['image', 'video']) {
      const verdict = validateNodeData(type, data);
      expect(verdict.ok).toBe(true);
      expect(verdict.ok && verdict.data.assetId).toBe('asset-1');
      expect(verdict.ok && verdict.data.mimeType).toBe('image/png');
    }
  });
});
