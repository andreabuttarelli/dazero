import { describe, it, expect } from 'vitest';
import { isBrandOwner } from './settings-actions';

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
