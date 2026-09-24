import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrandProfile, getConnectUrl } from '$lib/server/zernio';
import { canAffordSeat } from '$lib/server/social-connections';
import { brandSlugOf } from '$lib/server/tenancy/brand-slug';

// Ensures the brand's own Zernio profile exists, then redirects to the platform OAuth.
// Enforces that the org's credit balance covers the first month's account fee before connecting.
export const GET: RequestHandler = async ({ params, url, locals: { supabase, safeGetSession } }) => {
  const { session } = await safeGetSession();
  if (!session) throw redirect(303, '/login');

  const brandSlug = await brandSlugOf(supabase, params.projectId);
  if (!brandSlug) throw error(404, 'Brand not found');

  const { data: brand } = await supabase
    .from('brands')
    .select('id, org_id, name, zernio_profile_id')
    .eq('slug', brandSlug)
    .maybeSingle();
  if (!brand) throw error(404, 'Brand not found');

  // No credits for the first month's fee — send them to buy some before connecting.
  if (!(await canAffordSeat(supabase, brand.org_id))) {
    throw redirect(303, '/app/billing');
  }

  const profileId = await ensureBrandProfile(brand);
  // After authorising on Zernio, come back INTO our app (not stranded on Zernio). ?connected=1
  // triggers an immediate account sync. The onboarding setup flow returns to /activate so it can
  // resume at the connect step; everywhere else returns to Settings.
  const dest = url.searchParams.get('return') === 'activate' ? 'activate' : 'settings';

  // LinkedIn uses the headless flow: Zernio redirects back to our own selection page with a
  // pendingDataToken so the user can pick their personal profile OR a Company Page they admin.
  // Every other platform keeps the standard hosted flow (lands straight back with ?connected=1).
  if (params.platform === 'linkedin') {
    const redirectUrl = `${url.origin}/p/${params.projectId}/settings/linkedin?return=${dest}`;
    const authUrl = await getConnectUrl(profileId, 'linkedin', redirectUrl, { headless: true });
    throw redirect(303, authUrl);
  }

  // Facebook uses the same headless idea but Meta only allows posting to a Page (no personal
  // profile), so our selector lists the user's Pages. Picking a Page also picks its linked
  // Instagram Business account, which is how a user with several IGs chooses the right one.
  if (params.platform === 'facebook') {
    const redirectUrl = `${url.origin}/p/${params.projectId}/settings/facebook?return=${dest}`;
    const authUrl = await getConnectUrl(profileId, 'facebook', redirectUrl, { headless: true });
    throw redirect(303, authUrl);
  }

  const redirectUrl = `${url.origin}/p/${params.projectId}/${dest === 'activate' ? 'activate' : 'settings/connected-accounts'}?connected=1`;
  const authUrl = await getConnectUrl(profileId, params.platform, redirectUrl);
  throw redirect(303, authUrl);
};
