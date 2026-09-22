import { randomBytes } from 'node:crypto';
import type { Db } from '$lib/server/db/client';
import { createServiceRoleDb } from '$lib/server/db/client';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';
import { hashInviteToken, inviteStatus } from '$lib/server/repos/invites';
import type { OrgRole } from '$lib/server/repos/orgs';

/**
 * I DUE MOMENTI IN CUI L'APPARTENENZA STA NASCENDO.
 *
 * `auth_org_ids()` legge `orgs_members`. Prima che quella riga esista, la policy non protegge:
 * rifiuta — e rifiuta proprio la scrittura che la creerebbe. È l'unico caso in cui la RLS non
 * può funzionare per costruzione, e vale due volte:
 *
 *   prima org      l'utente non è in nessuna org: nessuno può inserire la sua
 *   invito         l'utente non è ANCORA in quell'org: la policy gli nasconde il proprio invito
 *
 * Entrambe passano dalla service role, ed entrambe hanno la loro riga nel registro. Il criterio
 * che le tiene oneste: nessuna delle due accetta un `org_id` da chi chiama. La prima lo crea, la
 * seconda lo LEGGE dall'invito trovato per impronta del token.
 */
const SLUG_SUFFIX_BYTES = 4;
const MAX_SLUG_STEM = 40;

const use = (path: string) => {
  const entry = SERVICE_ROLE_USES.find((u) => u.path.startsWith(path));
  if (!entry) {
    throw new Error(`uso della service role non dichiarato nel registro: ${path}`);
  }
  return entry;
};

/**
 * Lo slug è unico sulla tabella, e il nome non lo è: due «Acme» collidono al secondo. Il suffisso
 * casuale toglie la collisione senza un giro di lettura-poi-scrittura, che fra due richieste
 * simultanee non la toglierebbe comunque.
 */
export function orgSlugFrom(name: string): string {
  const stem = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_STEM);

  return `${stem || 'org'}-${randomBytes(SLUG_SUFFIX_BYTES).toString('hex')}`;
}

export type FirstOrg = { orgId: string; slug: string; role: OrgRole };

/**
 * La org e il suo primo membro, o nessuna delle due.
 *
 * Postgres non offre una transazione attraverso due chiamate PostgREST, quindi la atomicità la
 * fa il rollback esplicito: una org senza membri è invisibile a chiunque — `auth_org_ids()` non
 * la contiene mai — e resterebbe lì per sempre occupando il suo slug unico.
 */
export async function createFirstOrgWith(db: Db, input: { userId: string; name: string }): Promise<FirstOrg> {
  const slug = orgSlugFrom(input.name);

  const { data: org, error: orgError } = await db
    .from('orgs')
    .insert({ name: input.name, slug })
    .select('id, slug')
    .single();

  if (orgError) {
    throw orgError;
  }

  const { error: memberError } = await db
    .from('orgs_members')
    .insert({ org_id: org.id, user_id: input.userId, role: 'owner' })
    .select('id')
    .single();

  if (memberError) {
    await db.from('orgs').delete().eq('id', org.id);
    throw memberError;
  }

  return { orgId: org.id, slug: org.slug, role: 'owner' };
}

export function createFirstOrg(input: { userId: string; name: string }): Promise<FirstOrg> {
  return createFirstOrgWith(createServiceRoleDb(use('src/lib/server/tenancy/bootstrap.ts — createFirstOrg')), input);
}

export type AcceptOutcome =
  | { outcome: 'accepted'; orgId: string; role: OrgRole }
  | { outcome: 'invalid' };

/**
 * Accettare due volte non crea due membri.
 *
 * `unique (org_id, user_id)` lo impedisce comunque, ma un vincolo violato è un errore 500 in
 * faccia a chi ha solo ricaricato la pagina. Qui il secondo giro trova la riga e risponde come
 * il primo — e un token che non esiste, scaduto o già speso da qualcun altro risponde tutto
 * `invalid`: la stessa risposta, che non conferma nemmeno che l'org esista.
 */
export async function acceptInviteWith(
  db: Db,
  input: { token: string; userId: string; now?: Date }
): Promise<AcceptOutcome> {
  const now = input.now ?? new Date();

  const { data: invite, error } = await db
    .from('orgs_invites')
    .select('id, org_id, role, expires_at, accepted_at')
    .eq('token', hashInviteToken(input.token))
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!invite) {
    return { outcome: 'invalid' };
  }

  const status = inviteStatus(invite, now);
  if (status === 'expired') {
    return { outcome: 'invalid' };
  }

  const { data: existing, error: memberError } = await db
    .from('orgs_members')
    .select('role')
    .eq('org_id', invite.org_id)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (memberError) {
    throw memberError;
  }
  if (existing) {
    return { outcome: 'accepted', orgId: invite.org_id, role: existing.role as OrgRole };
  }

  // Speso da un altro account: il link ha già fatto il suo lavoro e non ne fa un secondo.
  if (status === 'accepted') {
    return { outcome: 'invalid' };
  }

  const { error: insertError } = await db
    .from('orgs_members')
    .insert({ org_id: invite.org_id, user_id: input.userId, role: invite.role })
    .select('id')
    .single();

  if (insertError) {
    throw insertError;
  }

  const { error: markError } = await db
    .from('orgs_invites')
    .update({ accepted_at: now.toISOString() })
    .eq('id', invite.id)
    .eq('org_id', invite.org_id);

  if (markError) {
    throw markError;
  }

  return { outcome: 'accepted', orgId: invite.org_id, role: invite.role as OrgRole };
}

export function acceptInvite(input: { token: string; userId: string }): Promise<AcceptOutcome> {
  return acceptInviteWith(
    createServiceRoleDb(use('src/lib/server/tenancy/bootstrap.ts — acceptInvite')),
    input
  );
}
