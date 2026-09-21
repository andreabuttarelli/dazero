import type { SupabaseClient } from '@supabase/supabase-js';

export type WebActivationStepKey = 'website';

export type WebActivationStatus = {
  hasWebsite: boolean;
  /** Ordered labels of the steps still to do (empty when the loop is active). */
  nextSteps: string[];
};

export type WebActivationStep = {
  key: WebActivationStepKey;
  label: string;
  done: boolean;
  /** App path to complete the step (includes /app/{slug}/…). */
  href: string;
};

const STEP_LABELS: Record<WebActivationStepKey, string> = {
  website: 'Connect an active website / blog'
};

export async function getWebActivationStatus(
  admin: SupabaseClient,
  brandId: string
): Promise<WebActivationStatus> {
  const { data: brand } = await admin.from('brands').select('website').eq('id', brandId).maybeSingle();

  const hasWebsite = !!String((brand as { website?: unknown } | null)?.website ?? '').trim();

  return { hasWebsite, nextSteps: hasWebsite ? [] : [STEP_LABELS.website] };
}

/** Ordered activation checklist with destination app paths (first undone step first). */
export async function firstSteps(
  admin: SupabaseClient,
  brandId: string
): Promise<WebActivationStep[]> {
  const { data: brand } = await admin.from('brands').select('slug').eq('id', brandId).maybeSingle();
  const slug = (brand as { slug?: string } | null)?.slug ?? brandId;
  const status = await getWebActivationStatus(admin, brandId);
  return [
    { key: 'website', label: STEP_LABELS.website, done: status.hasWebsite, href: `/app/${slug}/site` }
  ];
}
