import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createInvite,
  hashInviteToken,
  inviteStatus,
  listInvites,
  mintInviteToken,
  revokeInvite
} from '$lib/server/repos/invites';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';

const ORG = '11111111-1111-1111-1111-111111111111';
const INVITE = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-09-21T12:00:00Z');

const row = {
  id: INVITE,
  org_id: ORG,
  email: 'chi@esempio.it',
  role: 'member',
  expires_at: '2026-09-28T12:00:00Z',
  accepted_at: null,
  invited_by: USER,
  created_at: '2026-09-21T12:00:00Z'
};

describe('del token resta solo l impronta', () => {
  it('quello che si salva non è quello che si manda', () => {
    const { token, tokenHash } = mintInviteToken();

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('due inviti non condividono il token', () => {
    expect(mintInviteToken().token).not.toBe(mintInviteToken().token);
  });

  it('la colonna token porta l impronta, mai il segreto', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [row] });

    const { token } = await createInvite(db, {
      orgId: ORG,
      email: 'chi@esempio.it',
      role: 'member',
      invitedBy: USER,
      now: NOW
    });

    const payload = calls.find((c) => c.op === 'insert')!.payload as Record<string, string>;
    expect(payload.token).toBe(hashInviteToken(token));
    expect(payload.token).not.toBe(token);
  });
});

describe('un invito senza scadenza è una porta aperta per sempre', () => {
  it('nasce con una scadenza', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [row] });

    await createInvite(db, { orgId: ORG, email: 'chi@esempio.it', role: 'member', invitedBy: USER, now: NOW });

    const payload = calls.find((c) => c.op === 'insert')!.payload as Record<string, string>;
    expect(Date.parse(payload.expires_at)).toBeGreaterThan(NOW.getTime());
  });

  it('scaduto e accettato non sono pendenti', () => {
    expect(inviteStatus({ accepted_at: null, expires_at: '2026-09-28T12:00:00Z' }, NOW)).toBe('pending');
    expect(inviteStatus({ accepted_at: null, expires_at: '2026-09-20T12:00:00Z' }, NOW)).toBe('expired');
    expect(inviteStatus({ accepted_at: '2026-09-21T13:00:00Z', expires_at: '2026-09-28T12:00:00Z' }, NOW)).toBe(
      'accepted'
    );
  });
});

describe('gli inviti non escono dall org', () => {
  it('la creazione porta org_id nel payload', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [row] });

    await createInvite(db, { orgId: ORG, email: 'chi@esempio.it', role: 'member', invitedBy: USER, now: NOW });

    expect(calls.find((c) => c.op === 'insert')!.payload).toMatchObject({ org_id: ORG });
  });

  it('la lista filtra sull org', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [row] });

    await listInvites(db, ORG);

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG });
  });

  it('la revoca ripete l org nel WHERE', async () => {
    const { db, calls } = fakeDb({ orgs_invites: [row] });

    await revokeInvite(db, { orgId: ORG, inviteId: INVITE });

    expect(filtersOf(calls, 'delete')).toMatchObject({ id: INVITE, org_id: ORG });
  });

  it('non restituisce mai il token salvato a chi legge la lista', async () => {
    const { db } = fakeDb({ orgs_invites: [row] });

    const [invite] = await listInvites(db, ORG);

    expect(invite).not.toHaveProperty('token');
  });
});
