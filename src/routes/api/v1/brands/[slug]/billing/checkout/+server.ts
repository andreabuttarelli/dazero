import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, checkApiKeyWriteAccess, loadBrandForUser } from '$lib/server/cli-auth';
import { billingLink } from '$lib/server/billing-links';
import { isOrgOwner, orgBillingForBrand } from '$lib/server/org-billing';
import { CREDIT_LADDER } from '$lib/server/credit-ladder';
import { appOrigin } from '$lib/server/app-url';
import { CHECKOUT_LINK, statusForFailure } from '@dazero/api-contracts';

const SUBSCRIPTION_RUNGS = CREDIT_LADDER.map((rung) => ({
  usd: rung.price,
  label: `$${rung.price}/mo`
}));

/**
 * The subscription checkout has no plan names left — only the credit-ladder rungs (a monthly
 * price, and how many credits it grants: CREDIT_LADDER). The hosted portal carries the prices;
 * this endpoint only checks the rung asked for is one on the ladder and returns the same ladder
 * the web upgrade button offers. Like the portal link, the URL is returned once and stored nowhere.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
  const { supabase, user, apiKey, error } = await authenticate(request);
  if (error) return error;

  const { brand, error: brandError } = await loadBrandForUser(supabase, params.slug, apiKey);
  if (brandError) return brandError;

  const readOnly = checkApiKeyWriteAccess(apiKey);
  if (readOnly) return readOnly;

  const parsed = CHECKOUT_LINK.input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: 'invalid_input', details: parsed.error.issues }, { status: 400 });
  }

  const appBillingUrl = `${appOrigin(url)}/app/billing`;

  if (!(await isOrgOwner(supabase, brand.org_id, user.id))) {
    return json(
      { error: 'not_org_owner' },
      { status: statusForFailure(CHECKOUT_LINK, 'not_org_owner') }
    );
  }

  const wanted = parsed.data.usd;
  if (wanted != null && !SUBSCRIPTION_RUNGS.some((rung) => rung.usd === wanted)) {
    return json(
      { error: 'unknown_plan', plans: SUBSCRIPTION_RUNGS },
      { status: statusForFailure(CHECKOUT_LINK, 'unknown_plan') }
    );
  }

  const link = await billingLink(supabase, {
    slug: params.slug,
    returnUrl: appBillingUrl,
    flow: 'upgrade'
  });
  if (link.refusal) {
    return json(
      { error: link.refusal, message: link.message || undefined, app_billing_url: appBillingUrl },
      { status: statusForFailure(CHECKOUT_LINK, link.refusal) }
    );
  }

  return json({ ok: true, url: link.url, plans: SUBSCRIPTION_RUNGS });
};
