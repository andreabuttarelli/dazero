import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACCOUNT_SEAT_CREDITS } from '$lib/server/credit-ladder';

vi.mock('$lib/server/cli-auth', () => ({
  authenticate: vi.fn(),
  loadBrandForUser: vi.fn()
}));
vi.mock('$lib/server/app-url', () => ({ appOrigin: () => 'https://feega.test' }));

import { GET } from './+server';
import { authenticate, loadBrandForUser } from '$lib/server/cli-auth';

type Row = Record<string, unknown>;

function fakeSupabase(accounts: Row[], balance: number) {
  const socialQ = {
    select: () => socialQ,
    eq: () => socialQ,
    order: async () => ({ data: accounts })
  };
  const projectQ = {
    select: () => projectQ,
    eq: () => projectQ,
    is: () => projectQ,
    order: () => projectQ,
    limit: async () => ({ data: [{ id: 'project-1' }] })
  };
  return {
    from: (table: string) => (table === 'projects' ? projectQ : socialQ),
    rpc: async () => ({ data: balance, error: null })
  };
}

const BRAND = { id: 'brand-1', org_id: 'org-1', slug: 'demo' };

const IG = {
  platform: 'Instagram',
  handle: 'demo.brand',
  display_name: 'Demo Brand',
  status: 'active',
  connected_at: '2026-08-01T10:00:00.000Z'
};

const url = 'https://feega.test/api/v1/brands/demo/social/accounts';

const read = (accounts: Row[] = [IG], brand: Row = BRAND, balance = ACCOUNT_SEAT_CREDITS) => {
  vi.mocked(authenticate).mockResolvedValue({
    supabase: fakeSupabase(accounts, balance),
    apiKey: undefined,
    error: null
  } as never);
  vi.mocked(loadBrandForUser).mockResolvedValue({ brand, error: null } as never);

  return (GET as (e: unknown) => Promise<Response>)({
    request: new Request(url),
    params: { slug: 'demo' },
    url: new URL(url)
  }).then(async (res) => ({ res, body: await res.json() }));
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/brands/:slug/social/accounts', () => {
  it("dice su quale handle pubblica, non solo che la piattaforma c'è", async () => {
    const { body } = await read();

    expect(body.accounts).toEqual([
      {
        platform: 'instagram',
        username: 'demo.brand',
        display_name: 'Demo Brand',
        profile_url: null,
        status: 'active',
        connected_at: '2026-08-01T10:00:00.000Z'
      }
    ]);
    expect(body.connected_platforms).toEqual(['instagram']);
  });

  it('separa una piattaforma rotta da una che non è mai stata collegata', async () => {
    // Il caso che oggi nessuno vede: la riga c'è, il post è programmato, e non esce.
    const { body } = await read([{ ...IG, status: 'expired' }]);

    expect(body.connected_platforms).toEqual([]);
    expect(body.broken_platforms).toEqual(['instagram']);
  });

  it('non chiama rotta una piattaforma che ha anche un solo account vivo', async () => {
    const { body } = await read([
      { ...IG, status: 'disconnected', handle: 'vecchio' },
      { ...IG, handle: 'nuovo' }
    ]);

    expect(body.connected_platforms).toEqual(['instagram']);
    expect(body.broken_platforms).toEqual([]);
  });

  it("dice che senza crediti per il canone l'org non collega niente", async () => {
    const { body } = await read([], BRAND, ACCOUNT_SEAT_CREDITS - 1);

    expect(body.can_connect).toBe(false);
    expect(body.slots).toEqual({ used: 0, limit: 0 });
  });

  it('conta solo gli account attivi contro quanti l\'org può sostenere col saldo che ha', async () => {
    const { body } = await read([IG, { ...IG, platform: 'tiktok', status: 'disconnected' }]);

    expect(body.slots.used).toBe(1);
    expect(body.slots.limit).toBeGreaterThan(0);
  });

  it('porta il vocabolario delle piattaforme e la porta dove si scollega', async () => {
    const { body } = await read();

    expect(body.platform_choices).toContain('linkedin');
    expect(body.manage_url).toBe(
      'https://feega.test/p/project-1/settings/connected-accounts'
    );
  });

  it('non fa uscire un token, un id Zernio o qualunque altra credenziale', async () => {
    const { body } = await read([
      { ...IG, access_token: 'ig-secret', zernio_account_id: 'zern-1' }
    ]);

    expect(JSON.stringify(body)).not.toContain('ig-secret');
    expect(JSON.stringify(body)).not.toContain('zern-1');
    expect(JSON.stringify(body)).not.toMatch(/token|secret|zernio/i);
  });

  it('risponde esattamente quello che il contratto dichiara, niente di più', async () => {
    const { LIST_SOCIAL_ACCOUNTS_READ } = await import('@feega/api-contracts');
    const { body } = await read();

    expect(LIST_SOCIAL_ACCOUNTS_READ.output.strict().safeParse(body).success).toBe(true);
  });
});
