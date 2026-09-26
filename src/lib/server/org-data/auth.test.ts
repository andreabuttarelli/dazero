import { describe, expect, it, vi } from 'vitest';
import { createTestSupabase } from '$lib/testkit/supabase';

/**
 * IL CANCELLO CHE NON DEVE MAI LASCIAR PASSARE UN'ALTRA ORG.
 *
 * Una chiave API `feega_…` risolve `org_id` dalla riga trovata per `key_hash`: chi chiama non lo
 * sceglie mai. Se il chiamante passa un `orgId` diverso da quello della chiave, la richiesta va
 * rifiutata con lo stesso 404 di un id che non esiste — mai un errore che distingua le due cose,
 * o la rotta diventa un modo di scoprire quali org esistono.
 */
const RAW_KEY = 'feega_live_test-tenant-safety';

async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Un caricamento fresco del modulo, con una riga `api_keys` sola e le sue mock intorno. */
async function resolveWith(row: {
  org_id: string;
  scopes?: string[];
  revoked?: boolean;
  expired?: boolean;
}) {
  vi.resetModules();

  const rows: Record<string, unknown>[] = [
    {
      id: 'key-1',
      org_id: row.org_id,
      user_id: 'user-1',
      key_hash: await hashApiKey(RAW_KEY),
      scopes: row.scopes ?? ['read', 'write'],
      revoked_at: row.revoked ? new Date().toISOString() : null,
      expires_at: row.expired ? new Date(Date.now() - 1000).toISOString() : null
    }
  ];

  vi.doMock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' } }));
  vi.doMock('$env/dynamic/public', () => ({
    env: { PUBLIC_SUPABASE_URL: 'https://x.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'anon-key' }
  }));
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: () => createTestSupabase({ api_keys: rows }).client
  }));

  const { resolveOrgCaller } = await import('./auth');
  return resolveOrgCaller;
}

describe('resolveOrgCaller: una chiave API non sceglie mai la sua org', () => {
  it('senza orgId nominato, risolve nella org della chiave', async () => {
    const resolveOrgCaller = await resolveWith({ org_id: 'org-mine' });

    const result = await resolveOrgCaller(RAW_KEY);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.caller.orgId).toBe('org-mine');
      expect(result.caller.writeAllowed).toBe(true);
    }
  });

  it('un orgId di un\'altra org è rifiutato con lo stesso esito di un id inventato: 404, mai un errore che li distingua', async () => {
    const resolveA = await resolveWith({ org_id: 'org-mine' });
    const otherOrgResult = await resolveA(RAW_KEY, 'org-someone-elses');

    const resolveB = await resolveWith({ org_id: 'org-mine' });
    const fakeOrgResult = await resolveB(RAW_KEY, 'org-that-does-not-exist-at-all');

    expect('error' in otherOrgResult).toBe(true);
    expect('error' in fakeOrgResult).toBe(true);
    if ('error' in otherOrgResult && 'error' in fakeOrgResult) {
      expect(otherOrgResult.error.status).toBe(404);
      expect(otherOrgResult.error.status).toBe(fakeOrgResult.error.status);
      expect(otherOrgResult.error.body).toEqual(fakeOrgResult.error.body);
    }
  });

  it('una chiave revocata è rifiutata', async () => {
    const resolveOrgCaller = await resolveWith({ org_id: 'org-mine', revoked: true });

    const result = await resolveOrgCaller(RAW_KEY);

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('una chiave scaduta è rifiutata', async () => {
    const resolveOrgCaller = await resolveWith({ org_id: 'org-mine', expired: true });

    const result = await resolveOrgCaller(RAW_KEY);

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('una chiave read-only ha writeAllowed false, non un rifiuto qui — il rifiuto è del chiamante', async () => {
    const resolveOrgCaller = await resolveWith({ org_id: 'org-mine', scopes: ['read'] });

    const result = await resolveOrgCaller(RAW_KEY);

    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.caller.writeAllowed).toBe(false);
  });

  it('senza bearer, rifiuta prima di guardare qualunque tabella', async () => {
    const resolveOrgCaller = await resolveWith({ org_id: 'org-mine' });

    const result = await resolveOrgCaller(undefined);

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('una chiave inesistente (hash che non matcha nessuna riga) è rifiutata', async () => {
    const resolveOrgCaller = await resolveWith({ org_id: 'org-mine' });

    const result = await resolveOrgCaller('feega_live_not-the-right-key');

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });
});
