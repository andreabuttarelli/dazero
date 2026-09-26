import { describe, expect, it } from 'vitest';
import { acceptInviteWith, createFirstOrgWith, orgSlugFrom } from '$lib/server/tenancy/bootstrap';
import { hashInviteToken } from '$lib/server/repos/invites';
import { fakeDb, filtersOf, type Call } from '$lib/server/db/fake-db';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import { FreeOrgLimitReachedError } from '$lib/server/tenancy/free-org-limit';
import { WELCOME_CREDITS } from '$lib/server/credit-ladder';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const INVITE = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-09-21T12:00:00Z');

const orgRow = { id: ORG, name: 'Acme', slug: 'acme' };
const memberRow = { id: 'm1', org_id: ORG, user_id: USER, role: 'owner', created_at: NOW.toISOString() };

const inviteRow = {
  id: INVITE,
  org_id: ORG,
  email: 'chi@esempio.it',
  role: 'member',
  expires_at: '2026-09-28T12:00:00Z',
  accepted_at: null
};

const opsOn = (calls: Call[], table: string) => calls.filter((c) => c.table === table).map((c) => c.op);

describe('lo slug di una org nasce dal nome', () => {
  it('minuscolo, senza accenti, coi trattini', () => {
    expect(orgSlugFrom('Studio Però & Figli')).toMatch(/^studio-pero-figli-[a-z0-9]+$/);
  });

  it('due org con lo stesso nome non collidono sullo unique', () => {
    expect(orgSlugFrom('Acme')).not.toBe(orgSlugFrom('Acme'));
  });

  it('un nome che non lascia lettere resta uno slug valido', () => {
    expect(orgSlugFrom('••••')).toMatch(/^org-[a-z0-9]+$/);
  });
});

describe('la prima org di un utente nuovo', () => {
  it('crea la org e il suo primo membro', async () => {
    const { db, calls } = fakeDb({ orgs: [orgRow], orgs_members: [memberRow] });

    await createFirstOrgWith(db, { userId: USER, name: 'Acme' });

    expect(opsOn(calls, 'orgs')).toContain('insert');
    expect(opsOn(calls, 'orgs_members')).toContain('insert');
  });

  it("riceve i crediti di benvenuto, una riga credit_ledger source 'promo'", async () => {
    const { db, calls } = fakeDb({ orgs: [orgRow], orgs_members: [], credit_ledger: [] });

    await createFirstOrgWith(db, { userId: USER, name: 'Acme' });

    const grant = calls.find((c) => c.table === 'credit_ledger' && c.op === 'insert')!
      .payload as Record<string, unknown>;
    expect(grant).toMatchObject({ org_id: ORG, kind: 'grant', source: 'promo', amount: WELCOME_CREDITS });
    expect(grant.stripe_event_id).toBe(`welcome:${ORG}`);
    expect(grant.expires_at).toBeTruthy();
  });

  it("rifiuta e non crea niente quando l'utente ha già 2 org gratuite", async () => {
    const { db, calls } = fakeDb({
      orgs: [orgRow],
      orgs_members: [
        { org_id: 'free-1', user_id: USER, role: 'owner' },
        { org_id: 'free-2', user_id: USER, role: 'member' }
      ],
      credit_ledger: []
    });

    await expect(createFirstOrgWith(db, { userId: USER, name: 'Acme' })).rejects.toBeInstanceOf(
      FreeOrgLimitReachedError
    );

    // La org è nata (serve l'id per il controllo) ed è stata disfatta: nessuna riga resta.
    expect(opsOn(calls, 'orgs')).toEqual(['insert', 'delete']);
    expect(opsOn(calls, 'orgs_members')).not.toContain('insert');
    expect(opsOn(calls, 'credit_ledger')).not.toContain('insert');
  });

  it('il primo membro è owner: senza, nessuno può invitare', async () => {
    const { db, calls } = fakeDb({ orgs: [orgRow], orgs_members: [memberRow] });

    await createFirstOrgWith(db, { userId: USER, name: 'Acme' });

    const member = calls.find((c) => c.table === 'orgs_members' && c.op === 'insert')!.payload as Record<
      string,
      string
    >;
    expect(member).toMatchObject({ org_id: ORG, user_id: USER, role: 'owner' });
  });

  it('una org senza membro non resta in piedi: si cancella', async () => {
    const calls: Call[] = [];
    const db = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          calls.push({ table, op: 'insert', payload, filters: [] });
          const failing = {
            select: () => failing,
            single: async () =>
              table === 'orgs_members'
                ? { data: null, error: { message: 'rls' } }
                : { data: orgRow, error: null }
          };
          return failing;
        },
        delete: () => {
          const call: Call = { table, op: 'delete', filters: [] };
          calls.push(call);
          const chain = {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return chain;
            },
            then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null })
          };
          return chain;
        }
      })
    } as never;

    await expect(createFirstOrgWith(db, { userId: USER, name: 'Acme' })).rejects.toThrow();

    expect(opsOn(calls, 'orgs')).toContain('delete');
  });
});

describe('accettare un invito è idempotente', () => {
  it('un token che non esiste non dice che non esiste: risponde no', async () => {
    const { db } = fakeDb({ orgs_invites: [] });

    expect(await acceptInviteWith(db, { token: 'niente', userId: USER, now: NOW })).toEqual({
      outcome: 'invalid'
    });
  });

  it('un invito scaduto risponde come uno che non esiste', async () => {
    const { db } = fakeDb({
      orgs_invites: [{ ...inviteRow, expires_at: '2026-09-20T12:00:00Z' }]
    });

    expect(await acceptInviteWith(db, { token: 'x', userId: USER, now: NOW })).toEqual({ outcome: 'invalid' });
  });

  it('cerca per impronta, mai per token in chiaro', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [inviteRow], orgs_members: [] });

    await acceptInviteWith(db, { token: 'segreto', userId: USER, now: NOW });

    expect(filtersOf(calls, 'select')).toMatchObject({ token: hashInviteToken('segreto') });
  });

  /**
   * `fakeDb` non filtra per colonna (documentato in fake-db.ts): una `orgs_members` che porti sia
   * "le altre org gratuite dell'utente" sia "è già membro di QUESTA org" collide sulla stessa
   * tabella. Qui un fake minimo, filtrato per davvero, come org-billing.test.ts.
   */
  function inviteDb(opts: { existingFreeOrgIds: string[]; joiningOrgIsPaid: boolean }) {
    const inserted: Record<string, unknown>[] = [];
    return {
      from: (table: string) => {
        if (table === 'orgs_invites') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: inviteRow, error: null }) })
            }),
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) })
          };
        }
        if (table === 'orgs_members') {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                then: (resolve: (v: { data: unknown; error: null }) => void) =>
                  resolve({
                    data:
                      col === 'user_id'
                        ? opts.existingFreeOrgIds.map((id) => ({ org_id: id }))
                        : [],
                    error: null
                  })
              })
            }),
            insert: (payload: Record<string, unknown>) => {
              inserted.push(payload);
              return { select: () => ({ single: async () => ({ data: { id: 'm-new' }, error: null }) }) };
            }
          };
        }
        if (table === 'credit_ledger') {
          const rows = opts.joiningOrgIsPaid ? [{ org_id: ORG, source: 'one_time_purchase' }] : [];
          const resolved = { data: rows, error: null };
          return {
            select: () => ({
              eq: () => ({ then: (resolve: (v: typeof resolved) => void) => resolve(resolved) }),
              in: () => ({ then: (resolve: (v: typeof resolved) => void) => resolve(resolved) })
            })
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      inserted
    };
  }

  it("rifiuta un invito verso un'org gratuita quando l'utente ne ha già 2", async () => {
    const db = inviteDb({ existingFreeOrgIds: ['free-1', 'free-2'], joiningOrgIsPaid: false });

    await expect(
      acceptInviteWith(db as never, { token: 'segreto', userId: USER, now: NOW })
    ).rejects.toBeInstanceOf(FreeOrgLimitReachedError);

    expect(db.inserted).toEqual([]);
  });

  it("un invito verso un'org che ha già pagato non è mai bloccato dal limite", async () => {
    const db = inviteDb({ existingFreeOrgIds: ['free-1', 'free-2'], joiningOrgIsPaid: true });

    const result = await acceptInviteWith(db as never, { token: 'segreto', userId: USER, now: NOW });

    expect(result).toEqual({ outcome: 'accepted', orgId: ORG, role: 'member' });
    expect(db.inserted).toHaveLength(1);
  });

  it('il secondo giro non crea un secondo membro', async () => {
    const { db, calls } = fakeDb({
      orgs_invites: [{ ...inviteRow, accepted_at: '2026-09-21T11:00:00Z' }],
      orgs_members: [{ ...memberRow, role: 'member' }]
    });

    const result = await acceptInviteWith(db, { token: 'segreto', userId: USER, now: NOW });

    expect(result).toEqual({ outcome: 'accepted', orgId: ORG, role: 'member' });
    expect(opsOn(calls, 'orgs_members')).not.toContain('insert');
  });

  it("un invito accettato da qualcun altro non vale per chi non è già dentro", async () => {
    const { db } = fakeDb({
      orgs_invites: [{ ...inviteRow, accepted_at: '2026-09-21T11:00:00Z' }],
      orgs_members: []
    });

    expect(await acceptInviteWith(db, { token: 'segreto', userId: USER, now: NOW })).toEqual({
      outcome: 'invalid'
    });
  });

  it('un membro nasce col ruolo scritto sull invito', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [inviteRow], orgs_members: [] });

    await acceptInviteWith(db, { token: 'segreto', userId: USER, now: NOW });

    const insert = calls.find((c) => c.table === 'orgs_members' && c.op === 'insert')!;
    expect(insert.payload).toMatchObject({ org_id: ORG, user_id: USER, role: 'member' });
  });

  it('l invito consumato si marca accettato', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [inviteRow], orgs_members: [] });

    await acceptInviteWith(db, { token: 'segreto', userId: USER, now: NOW });

    const update = calls.find((c) => c.table === 'orgs_invites' && c.op === 'update')!;
    expect(update.payload).toMatchObject({ accepted_at: NOW.toISOString() });
    expect(Object.fromEntries(update.filters)).toMatchObject({ id: INVITE, org_id: ORG });
  });
});

describe('ogni scavalco della RLS sta nel registro', () => {
  it('il bootstrap non è più «non ancora scritto»', () => {
    const entry = SERVICE_ROLE_USES.find((u) => u.path.includes('tenancy/bootstrap'));

    expect(entry, 'la prima org manca dal registro').toBeDefined();
    expect(entry!.path).not.toContain('non ancora scritt');
  });

  it("l accettazione di un invito dichiara perché la RLS non può funzionare", () => {
    const entry = SERVICE_ROLE_USES.find((u) => u.tables.includes('orgs_invites'));

    expect(entry, "accettare un invito scavalca la RLS e non è dichiarato").toBeDefined();
    expect(entry!.why.length).toBeGreaterThan(20);
  });
});
