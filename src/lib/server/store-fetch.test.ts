/**
 * `fetchShopifyPage`/`fetchWooCommercePage` passano dalla stessa guardia SSRF già in produzione
 * (`tool-guard.ts::safeFetchUrl`), quindi qui si dimostrano tre cose: la paginazione (`after`
 * torna la pagina successiva o null all'ultima), la forma dei prodotti letti, e i fallimenti
 * leggibili — 404, corpo che non è JSON, e un host che risolve su un indirizzo privato.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

import { lookup } from 'node:dns/promises';
import { fetchShopifyPage, fetchWooCommercePage } from './store-fetch';

const PUBLIC_ADDRESS = '93.184.216.34';
const LOOPBACK = '127.0.0.1';

function resolvesTo(byHost: Record<string, string>) {
  vi.mocked(lookup).mockImplementation((async (host: string) => {
    const address = byHost[host];
    if (!address) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    return [{ address, family: 4 }];
  }) as never);
}

function serves(byUrl: Record<string, { status: number; body?: string }>) {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = String(input);
      requested.push(url);
      const hop = byUrl[url];
      if (!hop) throw new Error(`ECONNREFUSED ${url}`);
      return new Response(hop.body ?? '', {
        status: hop.status,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return requested;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function shopifyProduct(id: number, title: string) {
  return {
    id,
    title,
    handle: title.toLowerCase().replace(/\s+/g, '-'),
    body_html: `<p>${title} description</p>`,
    variants: [{ price: '19.90' }],
    images: [{ src: `https://cdn.example.com/${id}.jpg` }],
    available: true
  };
}

describe('fetchShopifyPage — paginazione', () => {
  it('torna after = pagina successiva quando la pagina è piena', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({
      'https://shop.example.com/products.json?limit=2&page=1': {
        status: 200,
        body: JSON.stringify({ products: [shopifyProduct(1, 'A'), shopifyProduct(2, 'B')] })
      }
    });

    const out = await fetchShopifyPage('https://shop.example.com', { limit: 2, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.products).toHaveLength(2);
    expect(out.after).toBe('2');
  });

  it('torna after = null quando la pagina è l\'ultima (meno prodotti del limite)', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({
      'https://shop.example.com/products.json?limit=5&page=1': {
        status: 200,
        body: JSON.stringify({ products: [shopifyProduct(1, 'A')] })
      }
    });

    const out = await fetchShopifyPage('https://shop.example.com', { limit: 5, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.after).toBeNull();
  });

  it('legge la pagina indicata da after', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    const requested = serves({
      'https://shop.example.com/products.json?limit=2&page=3': {
        status: 200,
        body: JSON.stringify({ products: [] })
      }
    });

    await fetchShopifyPage('https://shop.example.com', { limit: 2, after: '3', onlyFirstPhoto: false });
    expect(requested).toContain('https://shop.example.com/products.json?limit=2&page=3');
  });

  it('con only_first_photo tiene una sola immagine per prodotto', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({
      'https://shop.example.com/products.json?limit=10&page=1': {
        status: 200,
        body: JSON.stringify({
          products: [
            {
              ...shopifyProduct(1, 'A'),
              images: [{ src: 'https://cdn.example.com/1.jpg' }, { src: 'https://cdn.example.com/1b.jpg' }]
            }
          ]
        })
      }
    });

    const out = await fetchShopifyPage('https://shop.example.com', { limit: 10, after: null, onlyFirstPhoto: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.products[0].images).toHaveLength(1);
  });
});

describe('fetchShopifyPage — fallimenti leggibili', () => {
  it('un 404 torna un errore che nomina lo status, non un token muto', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({ 'https://shop.example.com/products.json?limit=50&page=1': { status: 404 } });

    const out = await fetchShopifyPage('https://shop.example.com', { limit: 50, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/404/);
  });

  it('un corpo che non è JSON torna un errore leggibile, non un\'eccezione non gestita', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({ 'https://shop.example.com/products.json?limit=50&page=1': { status: 200, body: '<html>not shopify</html>' } });

    const out = await fetchShopifyPage('https://shop.example.com', { limit: 50, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/store_invalid/);
  });

  it('un url non valido torna invalid_url senza mai aprire un socket', async () => {
    const requested = serves({});
    const out = await fetchShopifyPage('not a url', { limit: 50, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/invalid_url/);
    expect(requested).toHaveLength(0);
  });

  it('un host che risolve su un indirizzo privato è rifiutato prima del fetch (SSRF)', async () => {
    resolvesTo({ 'rebind.example.com': LOOPBACK });
    const requested = serves({});

    const out = await fetchShopifyPage('https://rebind.example.com', { limit: 50, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/not_public/);
    expect(requested).toHaveLength(0);
  });
});

function wooProduct(id: number, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    short_description: `<p>${name}</p>`,
    prices: { price: '1990', currency_code: 'EUR', currency_minor_unit: 2 },
    images: [{ src: `https://cdn.example.com/${id}.jpg` }],
    permalink: `https://shop.example.com/product/${name.toLowerCase()}`,
    is_in_stock: true
  };
}

describe('fetchWooCommercePage', () => {
  it('converte il prezzo dalle minor units usando currency_minor_unit', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({
      'https://shop.example.com/wp-json/wc/store/v1/products?per_page=10&page=1': {
        status: 200,
        body: JSON.stringify([wooProduct(1, 'Widget')])
      }
    });

    const out = await fetchWooCommercePage('https://shop.example.com', { limit: 10, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.products[0].price).toBe(19.9);
    expect(out.products[0].currency).toBe('EUR');
  });

  it('decodifica le HTML entity nel nome', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({
      'https://shop.example.com/wp-json/wc/store/v1/products?per_page=10&page=1': {
        status: 200,
        body: JSON.stringify([{ ...wooProduct(1, 'x'), name: 'Rock &amp; Roll' }])
      }
    });

    const out = await fetchWooCommercePage('https://shop.example.com', { limit: 10, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.products[0].title).toBe('Rock & Roll');
  });

  it('un corpo che non è un array torna store_invalid', async () => {
    resolvesTo({ 'shop.example.com': PUBLIC_ADDRESS });
    serves({
      'https://shop.example.com/wp-json/wc/store/v1/products?per_page=10&page=1': {
        status: 200,
        body: JSON.stringify({ error: 'not woocommerce' })
      }
    });

    const out = await fetchWooCommercePage('https://shop.example.com', { limit: 10, after: null, onlyFirstPhoto: false });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/store_invalid/);
  });
});
