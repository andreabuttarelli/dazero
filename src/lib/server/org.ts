import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * The user's oldest org, via membership (`orgs_members`) rather than an `owner_id` column on
 * `orgs` itself — the new schema doesn't have one, ownership is `orgs_members.role = 'owner'`.
 * A user may belong to several (production does), so "their org" has to mean one specific row,
 * always the same one — otherwise a new brand lands in whichever org the database happened to
 * return. `id` breaks a tie on identical timestamps.
 *
 * There used to be a `payingOrgId` preferred first: the org actually on a paid plan. `orgs` and
 * `brands` carry no plan/subscription columns on the new schema (billing has no home there yet —
 * see credits.ts's module doc), so that preference has nothing left to read and is gone with it.
 */
async function oldestOrgId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: memberships } = await supabase
    .from('orgs_members')
    .select('org_id')
    .eq('user_id', userId)
    .eq('role', 'owner');
  const ownedIds = (memberships ?? []).map((m) => (m as { org_id: string }).org_id);
  if (!ownedIds.length) return null;

  const { data: orgs } = await supabase.from('orgs').select('id, created_at').in('id', ownedIds);
  const rows = (orgs ?? []) as { id: string; created_at: string }[];
  if (!rows.length) return null;

  rows.sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1));
  return rows[0].id;
}

// Every user gets an org (their workspace) lazily on first need.
// Brands hang off an org, so this must run before a brand can be created.
export async function ensureOrgForUser(supabase: SupabaseClient, user: User): Promise<string | null> {
  const existing = await oldestOrgId(supabase, user.id);
  if (existing) return existing;

  const handle = user.email?.split('@')[0] ?? 'my';
  const { data: org, error } = await supabase
    .from('orgs')
    .insert({ name: `${handle}'s workspace`, slug: `${handle}-${crypto.randomUUID().slice(0, 8)}` })
    .select('id')
    .single();
  if (error || !org) return null;

  await supabase.from('orgs_members').insert({ org_id: org.id, user_id: user.id, role: 'owner' });

  // A concurrent first call may have inserted its own row a moment earlier: both answers
  // converge on the oldest, so two tabs cannot walk away with two different orgs.
  return (await oldestOrgId(supabase, user.id)) ?? org.id;
}
