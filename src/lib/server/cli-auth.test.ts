import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { authenticate, loadBrandForUser, type ApiKeyInfo, type CliBrand } from './cli-auth';
import { isRlsScoped } from '$lib/server/rls-client';
import { createTestSupabase } from '$lib/testkit/supabase';

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'a@b.c' } }, error: null }) }
  })
}));

const BRAND: CliBrand = {
  id: 'brand-1',
  org_id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  status: 'trial',
  plan: 'pro',
  timezone: 'Europe/Rome',
  target_platforms: ['instagram', 'facebook'],
  launched_at: null,
  content_prefs: null,
  setup_step: null,
  setup_completed_at: null,
  autopilot_enabled: false,
  autopilot_failure_count: 0,
  last_autopilot_run_at: null,
  zernio_profile_id: null,
  ads_settings: null
};

const API_KEY: ApiKeyInfo = {
  id: 'key-1',
  name: 'test key',
  user_id: 'user-1',
  permissions: { brand_ids: ['brand-1'], scopes: ['read'] }
};

/**
 * Mock supabase condiviso (src/lib/testkit) con filtri veri: le righe seminate devono
 * matchare davvero slug/owner_id/user_id, quindi il tenant-check è esercitato sul serio
 * (il vecchio stub ignorava ogni `.eq(...)`). La lookup dei brand resta una LIST query
 * (slug duplicati esistono in prod) e il testkit risolve `await query` in righe.
 */
function mockClient(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return createTestSupabase(tables).client;
}

describe('loadBrandForUser with API key', () => {
  it('returns the brand when the key user owns the brand org', async () => {
    const supabase = mockClient({ brands: [BRAND], organizations: [{ id: 'org-1', owner_id: 'user-1' }] });
    const { brand, error } = await loadBrandForUser(supabase, 'acme', API_KEY);
    expect(error).toBeUndefined();
    expect(brand?.id).toBe('brand-1');
  });

  it('returns 404 when the org is not owned by the key user and no brand membership', async () => {
    const supabase = mockClient({ brands: [BRAND] });
    const { brand, error } = await loadBrandForUser(supabase, 'acme', API_KEY);
    expect(brand).toBeUndefined();
    expect(error?.status).toBe(404);
    expect(await (error as Response).json()).toEqual({ error: 'Brand not found' });
  });

  it('returns the brand when the key user is a brand member', async () => {
    const supabase = mockClient({
      brands: [BRAND],
      brand_members: [{ brand_id: 'brand-1', user_id: 'user-1' }]
    });
    const { brand, error } = await loadBrandForUser(supabase, 'acme', API_KEY);
    expect(error).toBeUndefined();
    expect(brand?.id).toBe('brand-1');
  });

  it('returns 404 (not 403) when the brand is owned but outside the key brand_ids scope', async () => {
    // Anti-probing: an out-of-scope brand is indistinguishable from a non-existent slug.
    const supabase = mockClient({ brands: [BRAND], organizations: [{ id: 'org-1', owner_id: 'user-1' }] });
    const narrowed: ApiKeyInfo = {
      ...API_KEY,
      permissions: { brand_ids: ['brand-other'], scopes: ['read'] }
    };
    const { brand, error } = await loadBrandForUser(supabase, 'acme', narrowed);
    expect(brand).toBeUndefined();
    expect(error?.status).toBe(404);
  });

  it('returns 404 when the brand does not exist', async () => {
    const supabase = mockClient({});
    const { brand, error } = await loadBrandForUser(supabase, 'missing', API_KEY);
    expect(brand).toBeUndefined();
    expect(error?.status).toBe(404);
  });
});

describe('authenticate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('un JWT valido passa', async () => {
    const { authenticate } = await import('./cli-auth');
    const res = await authenticate(
      new Request('https://x/api/v1/brands', { headers: { authorization: 'Bearer jwt-token' } })
    );

    expect(res.error).toBeUndefined();
    expect(res.user?.id).toBe('user-1');
  });

  it('senza Authorization si prende un 401', async () => {
    const { authenticate } = await import('./cli-auth');
    const res = await authenticate(new Request('https://x/api/v1/brands'));

    expect(res.error?.status).toBe(401);
    expect(res.user).toBeUndefined();
  });
});

/**
 * Lo scope di scrittura di una chiave è imposto UNA volta, in `resolveCaller`, sul metodo: ogni
 * rotta che muta è un non-GET, quindi il metodo è l'intero controllo. È la ragione per cui una
 * rotta nuova non deve ricordarsi di nulla — ma è anche il motivo per cui, se quella riga sparisse,
 * sparirebbe per tutte insieme. Questo test è la prova che c'è.
 */
describe('una chiave di sola lettura', () => {
  const RAW_KEY = 'dazero_live_sololetturatest';

  async function callWithKey(method: string) {
    const rows: Record<string, unknown>[] = [];
    vi.resetModules();
    vi.doMock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' } }));
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => createTestSupabase({ api_keys: rows }).client
    }));

    const { authenticate, hashApiKey } = await import('./cli-auth');
    rows.push({
      id: 'key-1',
      user_id: 'user-1',
      name: 'read only',
      key_hash: await hashApiKey(RAW_KEY),
      permissions: { brand_ids: '*', scopes: ['read'] }
    });

    return authenticate(
      new Request('https://x/api/v1/brands/demo/settings/models', {
        method,
        headers: { authorization: `Bearer ${RAW_KEY}` }
      })
    );
  }

  it('legge senza ostacoli', async () => {
    const res = await callWithKey('GET');

    expect(res.error).toBeUndefined();
    expect(res.apiKey?.id).toBe('key-1');
  });

  it('non scrive: ogni metodo che muta è 403 prima ancora di entrare in una rotta', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await callWithKey(method);

      expect(res.error?.status, method).toBe(403);
      expect(await res.error!.json(), method).toEqual({ error: 'API key is read-only' });
    }
  });
});

/**
 * Il prefisso di una chiave cambia a ogni rinomina del prodotto, ma le chiavi già emesse restano
 * in mano ai clienti: `021_live_` viene dall'era precedente, `anomalia_` da quella prima di
 * dazero. Riconoscerli non è cortesia — è la differenza fra una rinomina e un'interruzione di
 * servizio silenziosa per chiunque non rigeneri la chiave.
 */
describe('una chiave emessa prima della rinomina', () => {
  async function callWithKey(rawKey: string) {
    const rows: Record<string, unknown>[] = [];
    vi.resetModules();
    vi.doMock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' } }));
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => createTestSupabase({ api_keys: rows }).client
    }));

    const { authenticate, hashApiKey } = await import('./cli-auth');
    rows.push({
      id: 'key-legacy',
      user_id: 'user-1',
      name: 'legacy',
      key_hash: await hashApiKey(rawKey),
      permissions: { brand_ids: '*', scopes: ['read'] }
    });

    return authenticate(
      new Request('https://x/api/v1/brands', { headers: { authorization: `Bearer ${rawKey}` } })
    );
  }

  it('entra ancora, qualunque sia il prefisso di quando è stata emessa', async () => {
    for (const rawKey of ['anomalia_live_chiavevecchia', '021_live_chiaveanticha', 'dazero_live_chiavenuova']) {
      const res = await callWithKey(rawKey);

      expect(res.error, rawKey).toBeUndefined();
      expect(res.apiKey?.id, rawKey).toBe('key-legacy');
    }
  });
});

/**
 * QUALE DEI DUE CLIENT ESCE DA `authenticate`. È la domanda su cui `query` decide di leggere, e
 * sbagliarla non dà un errore: dà le righe di ogni brand di ogni cliente.
 */
describe('il marchio RLS esce solo dal percorso JWT', () => {
  const bearer = (token: string) =>
    new Request('https://dazero.co/api/v1/brands/acme', { headers: { Authorization: `Bearer ${token}` } });

  it('il JWT utente torna un client marchiato: chiave anon, policy dell utente', async () => {
    const { supabase, error } = await authenticate(bearer('a.user.jwt'));

    expect(error).toBeUndefined();
    expect(isRlsScoped(supabase)).toBe(true);
  });

  /**
   * Il percorso a chiave API costruisce la service role (`bypassrls=true`): non si marchia, e non
   * si promuove a sessione utente nemmeno il giorno in cui avremo un segreto di firma — una chiave
   * porta `permissions.brand_ids`, spesso più stretto dei brand del suo proprietario, e la RLS non
   * vede quella restrizione. Coniare un JWT allargherebbe in silenzio una chiave ristretta.
   */
  it('il client service-role della chiave API non viene mai marchiato', () => {
    const src = readFileSync(new URL('./cli-auth.ts', import.meta.url), 'utf8');
    const marks = src.match(/markRlsScoped\(/g) ?? [];

    expect(marks).toHaveLength(1);
    for (const line of src.split('\n')) {
      if (line.includes('adminKey')) expect(line).not.toContain('markRlsScoped');
    }
  });
});
