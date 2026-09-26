import type { SupabaseClient } from '@supabase/supabase-js';

export type BrandContact = { userId: string; email: string; locale: string | null };

export async function brandOwnerContact(
  supabase: SupabaseClient,
  orgId: string
): Promise<BrandContact | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .maybeSingle();
  if (!org?.owner_id) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, locale')
    .eq('id', org.owner_id)
    .maybeSingle();
  if (!profile?.email) return null;

  return { userId: org.owner_id as string, email: profile.email, locale: profile.locale ?? null };
}

export async function brandContacts(
  supabase: SupabaseClient,
  orgId: string,
  brandId: string
): Promise<BrandContact[]> {
  const owner = await brandOwnerContact(supabase, orgId);
  const contacts = owner ? [owner] : [];

  const { data: members } = await supabase
    .from('brand_members')
    .select('user_id')
    .eq('brand_id', brandId);
  const ids = (members ?? []).map((m) => m.user_id as string).filter(Boolean);
  if (!ids.length) return contacts;

  const { data: profiles } = await supabase.from('profiles').select('id, email, locale').in('id', ids);
  for (const p of profiles ?? []) {
    if (!p.email) continue;
    if (contacts.some((c) => c.email.toLowerCase() === p.email.toLowerCase())) continue;
    contacts.push({ userId: p.id as string, email: p.email, locale: p.locale ?? null });
  }

  return contacts;
}
