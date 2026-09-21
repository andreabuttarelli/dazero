import { swallow } from '$lib/server/swallow';
import { env } from '$env/dynamic/private';
import { createAdminClient } from '$lib/server/supabase-admin';
import {
  getBrandScrapeTargets,
  materializeBrandHistory
} from '$lib/server/scrapecreators';
import { rebuildBrandContext } from '$lib/server/brand-context';
import { logOnboardingError } from '$lib/server/onboarding-errors';

/**
 * Post-create social analysis: ScrapeCreators history + context rebuild.
 * Runs in its own invocation (see /api/v1/onboarding/social-history/work) so early `?/create`
 * can redirect immediately after the brand row exists — site analysis and social analysis are
 * separate processes and do not share a 120s budget.
 */
export async function runSocialHistoryForBrand(brandId: string): Promise<{
  synced: number;
  accounts: number;
}> {
  const admin = createAdminClient();
  const { data: brand } = await admin
    .from('brands')
    .select('id, name, plan, created_by, website')
    .eq('id', brandId)
    .maybeSingle();
  if (!brand) return { synced: 0, accounts: 0 };

  const targets = await getBrandScrapeTargets(admin, brandId);
  if (!targets.length) return { synced: 0, accounts: 0 };

  try {
    const res = await materializeBrandHistory(admin, brandId, targets);
    if (res.synced > 0) {
      await rebuildBrandContext(admin, brandId).catch(swallow('rebuild brand context'));
    }
    return { synced: res.synced, accounts: res.accounts };
  } catch (e) {
    await logOnboardingError(admin, String(brand.created_by ?? ''), 'social_history', e, {
      brandId,
      accounts: targets.length
    });
    throw e;
  }
}

/** Fire-and-forget nudge so social history starts without blocking the create redirect. */
export async function kickSocialHistoryWork(origin: string, brandId: string): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.AUTOPILOT_SECRET) headers['x-autopilot-secret'] = env.AUTOPILOT_SECRET;
  else if (env.CRON_SECRET) headers.authorization = `Bearer ${env.CRON_SECRET}`;
  await fetch(`${origin}/api/v1/onboarding/social-history/work`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ brandId })
  }).catch(swallow('JSON.stringify failed'));
}
