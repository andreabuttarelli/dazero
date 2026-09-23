import { describe, it, expect, vi, beforeEach } from 'vitest';

const createInvite = vi.fn();
const revokeInviteRepo = vi.fn();

vi.mock('$lib/server/repos/invites', () => ({
  createInvite: (...a: unknown[]) => createInvite(...a),
  revokeInvite: (...a: unknown[]) => revokeInviteRepo(...a)
}));
vi.mock('$lib/server/email', () => ({
  sendEmail: vi.fn(),
  brandInviteEmailSubject: () => 'subject',
  brandInviteEmailHtml: () => '<p>html</p>',
  brandInviteEmailText: () => 'text'
}));
vi.mock('$lib/server/email-i18n', () => ({ emailLocale: () => 'en' }));

import { isBrandOwner, invite, revokeInvite, createApiKey, revokeApiKey } from './settings-actions';

type Filter = { op: string; column: string; value: unknown };

function fakeSupabase(tables: Record<string, Record<string, unknown>[]>, userId: string | null) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: userId ? { id: userId } : null }, error: null })
    },
    from(table: string) {
      const filters: Filter[] = [];
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (column: string, value: unknown) => {
          filters.push({ op: 'eq', column, value });
          return q;
        },
        maybeSingle: () => {
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every((f) => (row[f.column] ?? null) === f.value)
          );
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        }
      });
      return q;
    }
  };
}

type SupabaseLike = Parameters<typeof isBrandOwner>[0];

describe('isBrandOwner sullo schema nuovo', () => {
  it('è vero quando il ruolo in orgs_members è owner', async () => {
    const client = fakeSupabase(
      {
        brands: [{ slug: 'acme', org_id: 'org-1' }],
        orgs_members: [{ org_id: 'org-1', user_id: 'user-1', role: 'owner' }]
      },
      'user-1'
    );

    const isOwner = await isBrandOwner(client as unknown as SupabaseLike, 'acme');

    expect(isOwner).toBe(true);
  });

  it('è falso per un membro non owner', async () => {
    const client = fakeSupabase(
      {
        brands: [{ slug: 'acme', org_id: 'org-1' }],
        orgs_members: [{ org_id: 'org-1', user_id: 'user-1', role: 'member' }]
      },
      'user-1'
    );

    const isOwner = await isBrandOwner(client as unknown as SupabaseLike, 'acme');

    expect(isOwner).toBe(false);
  });

  it('è falso quando il brand non esiste', async () => {
    const client = fakeSupabase({ brands: [], orgs_members: [] }, 'user-1');

    const isOwner = await isBrandOwner(client as unknown as SupabaseLike, 'ghost');

    expect(isOwner).toBe(false);
  });

  it('è falso senza un utente autenticato', async () => {
    const client = fakeSupabase(
      {
        brands: [{ slug: 'acme', org_id: 'org-1' }],
        orgs_members: [{ org_id: 'org-1', user_id: 'user-1', role: 'owner' }]
      },
      null
    );

    const isOwner = await isBrandOwner(client as unknown as SupabaseLike, 'acme');

    expect(isOwner).toBe(false);
  });
});

describe('invite/revokeInvite sullo schema nuovo (orgs_invites, non brand_invites)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fakeBrandClient(brand: { id: string; name: string; org_id: string } | null, userId = 'user-1') {
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: userId, email: 'owner@example.com' } } }) },
      from: (table: string) => {
        if (table !== 'brands') throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: brand }) }) })
        };
      }
    };
  }

  it('invita per org_id, con un ruolo, non un brand_id su una tabella inesistente', async () => {
    createInvite.mockResolvedValue({
      invite: { id: 'inv-1', email: 'x@y.com', role: 'member', status: 'pending', expiresAt: '', createdAt: '' },
      token: 'tok'
    });
    const fd = new FormData();
    fd.set('email', 'x@y.com');

    const result = await invite({
      request: { formData: () => Promise.resolve(fd) },
      params: { brand: 'acme' },
      url: new URL('https://dazero.test/p/x/settings/team'),
      cookies: { get: () => undefined },
      locals: { supabase: fakeBrandClient({ id: 'brand-1', name: 'Acme', org_id: 'org-1' }) }
    } as never);

    expect(createInvite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: 'org-1', email: 'x@y.com', role: 'member', invitedBy: 'user-1' })
    );
    expect(result).toMatchObject({ teamInvited: true });
  });

  it('revoca per org_id, mai un brand_members che non esiste', async () => {
    revokeInviteRepo.mockResolvedValue(undefined);
    const fd = new FormData();
    fd.set('invite_id', 'inv-1');

    const result = await revokeInvite({
      request: { formData: () => Promise.resolve(fd) },
      params: { brand: 'acme' },
      locals: { supabase: fakeBrandClient({ id: 'brand-1', name: 'Acme', org_id: 'org-1' }) }
    } as never);

    expect(revokeInviteRepo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: 'org-1', inviteId: 'inv-1' })
    );
    expect(result).toMatchObject({ teamRevoked: true });
  });
});

describe('createApiKey/revokeApiKey sullo schema nuovo (api_keys.scopes, org_id — non permissions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fakeApiKeyClient(
    brand: { id: string; org_id: string } | null,
    onInsert: (row: Record<string, unknown>) => void = () => {}
  ) {
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => {
        if (table === 'brands') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: brand }) }) }) };
        }
        if (table === 'api_keys') {
          return {
            insert: (row: Record<string, unknown>) => {
              onInsert(row);
              return Promise.resolve({ error: null });
            },
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) })
          };
        }
        throw new Error(`unexpected table ${table}`);
      }
    };
  }

  it('inserisce org_id e scopes, non una colonna permissions che non esiste', async () => {
    let inserted: Record<string, unknown> = {};
    const fd = new FormData();
    fd.set('key_name', 'CI key');
    fd.set('write', 'true');

    const result = await createApiKey({
      request: { formData: () => Promise.resolve(fd) },
      params: { brand: 'acme' },
      locals: { supabase: fakeApiKeyClient({ id: 'brand-1', org_id: 'org-1' }, (row) => (inserted = row)) }
    } as never);

    expect(inserted).toMatchObject({ org_id: 'org-1', user_id: 'user-1', scopes: ['read', 'write'] });
    expect(inserted).not.toHaveProperty('permissions');
    expect(result).toMatchObject({ apiKeyCreated: true });
  });

  it('revoca scoperta all\'org del brand, non una delete senza confine di tenant', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const client = {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => {
        if (table === 'brands') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { org_id: 'org-1' } }) }) })
          };
        }
        if (table === 'api_keys') {
          return {
            delete: () => ({
              eq: (col: string, val: unknown) => {
                eqCalls.push([col, val]);
                return { eq: (col2: string, val2: unknown) => { eqCalls.push([col2, val2]); return Promise.resolve({ error: null }); } };
              }
            })
          };
        }
        throw new Error(`unexpected table ${table}`);
      }
    };
    const fd = new FormData();
    fd.set('key_id', 'key-1');

    const result = await revokeApiKey({
      request: { formData: () => Promise.resolve(fd) },
      params: { brand: 'acme' },
      locals: { supabase: client }
    } as never);

    expect(eqCalls).toContainEqual(['id', 'key-1']);
    expect(eqCalls).toContainEqual(['org_id', 'org-1']);
    expect(result).toMatchObject({ apiKeyRevoked: true });
  });
});
