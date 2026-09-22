import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';
import type { OrgRole } from '$lib/server/repos/orgs';

/**
 * L'INVITO: UN LINK CHE VALE UNA VOLTA E PER UN TEMPO.
 *
 * Della colonna `token` resta solo l'impronta — un dump del database non produce link
 * funzionanti, esattamente come per `api_keys.key_hash` e per le viste condivise. Il segreto
 * esiste una volta sola, nel valore che `createInvite` restituisce a chi lo spedisce.
 *
 * Qui ci sta la metà autenticata: chi invita è già dentro l'org, quindi la chiave anon basta e
 * la RLS difende. L'ALTRA metà — accettare — non può stare qui: chi accetta non è ancora
 * membro, `auth_org_ids()` non contiene l'org e la policy nasconderebbe l'invito proprio a chi
 * lo sta usando. Vive in `tenancy/bootstrap`, con la sua voce nel registro.
 */
type InviteRow = Database['public']['Tables']['orgs_invites']['Row'];

const TOKEN_BYTES = 32;
const EXPIRES_IN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InviteStatus = 'pending' | 'accepted' | 'expired';

export type Invite = {
  id: string;
  email: string;
  role: OrgRole;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
};

const INVITE_COLUMNS = 'id, email, role, expires_at, accepted_at, created_at';

type InviteColumns = Pick<InviteRow, 'id' | 'email' | 'role' | 'expires_at' | 'accepted_at' | 'created_at'>;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

/** Le tre condizioni di un invito, decise in un posto solo: accettato, scaduto, oppure vale. */
export function inviteStatus(
  row: Pick<InviteRow, 'accepted_at' | 'expires_at'>,
  now: Date
): InviteStatus {
  if (row.accepted_at) {
    return 'accepted';
  }
  if (Date.parse(row.expires_at) <= now.getTime()) {
    return 'expired';
  }
  return 'pending';
}

function toInvite(row: InviteColumns, now: Date): Invite {
  return {
    id: row.id,
    email: row.email,
    role: row.role as OrgRole,
    status: inviteStatus(row, now),
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

export async function createInvite(
  db: Db,
  input: { orgId: string; email: string; role: OrgRole; invitedBy: string; now?: Date }
): Promise<{ invite: Invite; token: string }> {
  const now = input.now ?? new Date();
  const { token, tokenHash } = mintInviteToken();

  const { data, error } = await db
    .from('orgs_invites')
    .insert({
      org_id: input.orgId,
      email: input.email.toLowerCase(),
      role: input.role,
      token: tokenHash,
      expires_at: new Date(now.getTime() + EXPIRES_IN_DAYS * DAY_MS).toISOString(),
      invited_by: input.invitedBy
    })
    .select(INVITE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return { invite: toInvite(data, now), token };
}

export async function listInvites(db: Db, orgId: string, now = new Date()): Promise<Invite[]> {
  const { data, error } = await db
    .from('orgs_invites')
    .select(INVITE_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => toInvite(row, now));
}

export async function revokeInvite(
  db: Db,
  input: { orgId: string; inviteId: string }
): Promise<void> {
  const { error } = await db
    .from('orgs_invites')
    .delete()
    .eq('id', input.inviteId)
    .eq('org_id', input.orgId);

  if (error) {
    throw error;
  }
}
