import type { Db } from '$lib/server/db/client';
import type { Database } from '$lib/database.types';

/**
 * L'ORG È LA RADICE DEL TENANT: senza, non esiste nient'altro.
 *
 * Queste letture sono il posto in cui un id che arriva da fuori diventa un'org di cui l'utente
 * fa parte. Chi chiama i repository degli altri aggregati passa un `orgId`, e la domanda «è
 * suo?» ha una risposta sola: `memberRole`, che legge `orgs_members` con l'utente accanto.
 */
type OrgRow = Database['public']['Tables']['orgs']['Row'];

export const ORG_ROLES = ['owner', 'admin', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type Org = {
  id: string;
  name: string;
  slug: string;
};

export type Membership = {
  org: Org;
  role: OrgRole;
};

const ORG_COLUMNS = 'id, name, slug';

function toOrg(row: Pick<OrgRow, 'id' | 'name' | 'slug'>): Org {
  return { id: row.id, name: row.name, slug: row.slug };
}

export async function listMemberships(db: Db, userId: string): Promise<Membership[]> {
  const { data, error } = await db
    .from('orgs_members')
    .select(`role, orgs!inner(${ORG_COLUMNS})`)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    org: toOrg(row.orgs as Pick<OrgRow, 'id' | 'name' | 'slug'>),
    role: row.role as OrgRole
  }));
}

export async function findOrgBySlug(
  db: Db,
  input: { userId: string; slug: string }
): Promise<Membership | null> {
  const memberships = await listMemberships(db, input.userId);

  return memberships.find((m) => m.org.slug === input.slug) ?? null;
}

/** La risposta a «quest'org è sua?». Null significa no, non «non lo so». */
export async function memberRole(
  db: Db,
  input: { userId: string; orgId: string }
): Promise<OrgRole | null> {
  const { data, error } = await db
    .from('orgs_members')
    .select('role')
    .eq('org_id', input.orgId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return (data?.role as OrgRole) ?? null;
}

export async function listMembers(
  db: Db,
  orgId: string
): Promise<{ userId: string; role: OrgRole; email: string; name: string | null }[]> {
  const { data, error } = await db
    .from('orgs_members')
    .select('user_id, role, profiles!inner(email, name)')
    .eq('org_id', orgId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const profile = row.profiles as { email: string; name: string | null };
    return {
      userId: row.user_id,
      role: row.role as OrgRole,
      email: profile.email,
      name: profile.name
    };
  });
}
