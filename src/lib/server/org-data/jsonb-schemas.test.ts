import { describe, expect, it } from 'vitest';
import { JSONB_COLUMN_SCHEMAS, validateJsonbColumn, jsonbColumnsOf } from './jsonb-schemas';

describe('JSONB_COLUMN_SCHEMAS — un posto solo per le 20 colonne jsonb raggiungibili da insert_row/update_row', () => {
  it('elenca ogni colonna trovata sul database vero (klnswzhhgrqvbfjzioul), tabella.colonna', () => {
    const keys = Object.keys(JSONB_COLUMN_SCHEMAS).sort();
    expect(keys).toEqual(
      [
        'ad_campaigns.placements',
        'ad_campaigns.targeting',
        'ad_creatives.media',
        'brands.palette',
        'brands.target',
        'canvas_events.after',
        'canvas_events.before',
        'canvases.viewport',
        'chat_messages.attachments',
        'chat_messages.tool_calls',
        'competitor_ads.media',
        'competitor_ads.raw',
        'node_runs.params',
        'nodes.data',
        'posts.media',
        'posts.per_platform',
        'products.images',
        'scheduled_posts.media',
        'social_posts.media',
        'social_posts.metrics'
      ].sort()
    );
  });

  it('ogni entry dichiara se è validata o intenzionalmente libera, mai in silenzio', () => {
    for (const [key, entry] of Object.entries(JSONB_COLUMN_SCHEMAS)) {
      expect(entry, key).toHaveProperty('kind');
      expect(['validated', 'free_form']).toContain(entry.kind);
      if (entry.kind === 'free_form') {
        expect(entry.reason, `${key} manca il motivo`).toBeTruthy();
      }
    }
  });
});

describe('jsonbColumnsOf — quali colonne jsonb ha una tabella, per attivare la validazione solo lì', () => {
  it('nodes ha data', () => {
    expect(jsonbColumnsOf('nodes')).toEqual(['data']);
  });

  it('posts ha media e per_platform', () => {
    expect(jsonbColumnsOf('posts').sort()).toEqual(['media', 'per_platform']);
  });

  it('una tabella senza colonne jsonb registrate torna vuota', () => {
    expect(jsonbColumnsOf('orgs')).toEqual([]);
  });
});

describe('validateJsonbColumn — posts.media: PostMedia[], la stessa forma di create_post', () => {
  it('accetta un array di { assetId, order }', () => {
    const out = validateJsonbColumn('posts', 'media', [{ assetId: 'a1', order: 0 }]);
    expect(out.ok).toBe(true);
  });

  it('rifiuta un oggetto invece di un array, e nomina la colonna', () => {
    const out = validateJsonbColumn('posts', 'media', { assetId: 'a1' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/posts\.media/);
  });

  it('rifiuta un elemento senza assetId', () => {
    const out = validateJsonbColumn('posts', 'media', [{ order: 0 }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/assetId/);
  });
});

describe('validateJsonbColumn — scheduled_posts.media: la stessa forma di posts.media', () => {
  it('accetta lo stesso array', () => {
    const out = validateJsonbColumn('scheduled_posts', 'media', [{ assetId: 'a1', order: 1, role: 'primary' }]);
    expect(out.ok).toBe(true);
  });
});

describe('validateJsonbColumn — ad_campaigns.targeting: la stessa forma che il prodotto già manda a Zernio', () => {
  it('accetta age/genders/countries/interests', () => {
    const out = validateJsonbColumn('ad_campaigns', 'targeting', {
      age_min: 18,
      age_max: 45,
      genders: ['female'],
      countries: ['IT'],
      interests: [{ id: '123', name: 'running' }]
    });
    expect(out.ok).toBe(true);
  });

  it('rifiuta age_min non numerico', () => {
    const out = validateJsonbColumn('ad_campaigns', 'targeting', { age_min: 'eighteen' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/age_min/);
  });

  it('un targeting vuoto è ammesso: nessun filtro è una scelta legittima', () => {
    const out = validateJsonbColumn('ad_campaigns', 'targeting', {});
    expect(out.ok).toBe(true);
  });
});

describe('validateJsonbColumn — ad_campaigns.placements: string[]', () => {
  it('accetta un elenco di piattaforme', () => {
    const out = validateJsonbColumn('ad_campaigns', 'placements', ['feed', 'stories']);
    expect(out.ok).toBe(true);
  });

  it('rifiuta un elemento non stringa', () => {
    const out = validateJsonbColumn('ad_campaigns', 'placements', ['feed', 42]);
    expect(out.ok).toBe(false);
  });
});

describe('validateJsonbColumn — canvases.viewport: la stessa forma di repos/canvas.ts::saveViewport', () => {
  it('accetta x/y/zoom', () => {
    const out = validateJsonbColumn('canvases', 'viewport', { x: 100, y: -40, zoom: 1.5 });
    expect(out.ok).toBe(true);
  });

  it('rifiuta zoom mancante', () => {
    const out = validateJsonbColumn('canvases', 'viewport', { x: 0, y: 0 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/zoom/);
  });
});

describe('validateJsonbColumn — colonne intenzionalmente libere: passano sempre, per costruzione', () => {
  const FREE_FORM: Array<[string, string]> = [
    ['competitor_ads', 'raw'],
    ['canvas_events', 'before'],
    ['canvas_events', 'after'],
    ['chat_messages', 'tool_calls'],
    ['chat_messages', 'attachments'],
    ['brands', 'palette'],
    ['brands', 'target'],
    ['node_runs', 'params'],
    ['ad_creatives', 'media'],
    ['social_posts', 'media'],
    ['social_posts', 'metrics'],
    ['competitor_ads', 'media'],
    ['products', 'images']
  ];

  for (const [table, column] of FREE_FORM) {
    it(`${table}.${column} accetta qualunque JSON, dichiarato libero apposta`, () => {
      expect(validateJsonbColumn(table, column, { qualunque: 'cosa', anche: [1, 2, 3] }).ok).toBe(true);
      expect(validateJsonbColumn(table, column, 'anche una stringa').ok).toBe(true);
      expect(validateJsonbColumn(table, column, null).ok).toBe(true);
    });
  }
});

describe('validateJsonbColumn — una colonna non registrata non blocca niente', () => {
  it('una colonna jsonb ipotetica fuori registro passa senza essere giudicata', () => {
    const out = validateJsonbColumn('orgs', 'settings', { qualunque: 'cosa' });
    expect(out.ok).toBe(true);
  });
});
