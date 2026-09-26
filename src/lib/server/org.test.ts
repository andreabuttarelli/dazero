import { describe, expect, it } from 'vitest';
import { createTestSupabase } from '$lib/testkit/supabase';
import { ensureOrgForUser } from './org';

// `orgs` on the new schema has no owner_id, no plan, no subscription: ownership is
// `orgs_members.role = 'owner'`, and there is no "paying org" preference anymore — billing has
// no home on this schema yet (see credits.ts's module doc). ensureOrgForUser now answers with
// the oldest org the user owns, full stop.

const USER = { id: 'u1', email: 'ana@example.com' } as never;

const THREE_ORGS = [
  { id: 'org-new', created_at: '2026-09-01' },
  { id: 'org-mid', created_at: '2026-05-01' },
  { id: 'org-old', created_at: '2026-01-01' }
];

const memberships = (ownerships: { org_id: string; user_id: string; role?: string }[]) =>
  ownerships.map((m) => ({ role: 'owner', ...m }));

describe('ensureOrgForUser', () => {
  it('always answers with the oldest org when the user owns several', async () => {
    const { client, tables } = createTestSupabase({
      orgs: THREE_ORGS,
      orgs_members: memberships([
        { org_id: 'org-new', user_id: 'u1' },
        { org_id: 'org-mid', user_id: 'u1' },
        { org_id: 'org-old', user_id: 'u1' }
      ])
    });

    const answers = [
      await ensureOrgForUser(client, USER),
      await ensureOrgForUser(client, USER),
      await ensureOrgForUser(client, USER)
    ];

    expect(answers).toEqual(['org-old', 'org-old', 'org-old']);
    expect(tables.get('orgs')).toHaveLength(3);
  });

  it('ignores another user’s org entirely', async () => {
    const { client } = createTestSupabase({
      orgs: [...THREE_ORGS, { id: 'org-theirs', created_at: '2026-01-01' }],
      orgs_members: memberships([
        { org_id: 'org-new', user_id: 'u1' },
        { org_id: 'org-theirs', user_id: 'u2' }
      ])
    });

    expect(await ensureOrgForUser(client, USER)).toBe('org-new');
  });

  it('ignores a membership that is not the owner role', async () => {
    const { client } = createTestSupabase({
      orgs: THREE_ORGS,
      orgs_members: [
        { org_id: 'org-old', user_id: 'u1', role: 'member' },
        { org_id: 'org-mid', user_id: 'u1', role: 'owner' }
      ]
    });

    expect(await ensureOrgForUser(client, USER)).toBe('org-mid');
  });

  it('creates the org on a first call and reuses it on the next', async () => {
    const { client, tables } = createTestSupabase({});

    const first = await ensureOrgForUser(client, USER);
    const second = await ensureOrgForUser(client, USER);

    expect(first).toBe(second);
    expect(tables.get('orgs')).toHaveLength(1);
    expect(tables.get('orgs_members')).toEqual([
      expect.objectContaining({ org_id: first, user_id: 'u1', role: 'owner' })
    ]);
  });

  it('gives two concurrent first calls the same org id', async () => {
    const { client } = createTestSupabase({});

    const [a, b] = await Promise.all([ensureOrgForUser(client, USER), ensureOrgForUser(client, USER)]);

    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
