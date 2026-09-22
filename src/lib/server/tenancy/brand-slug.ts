import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * DA UN PROGETTO AL SUO BRAND, QUANDO LE PAGINE ANCORA CHIEDONO LO SLUG DEL BRAND.
 *
 * Le pagine che stanno sotto `/p/<projectId>/…` parlano di brand — un calendario, una libreria,
 * un sito sono del brand. Ma il tenant nell'URL è il progetto, e `projects.brand_id` è nullable.
 * Questo ponte risolve lo slug, e dice chiaramente «non c'è» invece di far cercare uno slug vuoto.
 */
export async function brandSlugOf(
  supabase: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('brand_id')
    .eq('id', projectId)
    .maybeSingle();

  const brandId = project?.brand_id;
  if (!brandId) {
    return null;
  }

  const { data: brand } = await supabase
    .from('brands')
    .select('slug')
    .eq('id', brandId)
    .maybeSingle();

  return brand?.slug ?? null;
}

export async function brandIdOf(
  supabase: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('brand_id')
    .eq('id', projectId)
    .maybeSingle();

  return project?.brand_id ?? null;
}

/** Il verso opposto: dal brand al progetto che lo contiene, per un link che deve atterrare su
 *  `/p/<projectId>/…` conoscendo solo il brand (es. un URL coniato da una rotta API keyed by
 *  slug). Un brand senza progetto — o con più d'uno — non ha un solo link corretto: `null`. */
export async function projectIdOfBrand(
  supabase: SupabaseClient,
  brandId: string
): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('brand_id', brandId)
    .maybeSingle();

  return project?.id ?? null;
}
