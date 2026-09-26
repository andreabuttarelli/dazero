import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, checkApiKeyWriteAccess, loadBrandForUser } from '$lib/server/cli-auth';
import { isOrgOwner, orgBillingForBrand } from '$lib/server/org-billing';
import { billingGrantsReady } from '$lib/server/billing-readiness';
import { CREDIT_LADDER } from '$lib/server/credit-ladder';
import { appOrigin } from '$lib/server/app-url';
import { ONE_TIME_CHECKOUT_LINK, statusForFailure } from '@feega/api-contracts';

/**
 * The one-time side of CREDIT_LADDER: a fixed batch of credits bought once, at the 70:1 rate
 * (`creditsOneTime`), that never expires. Unlike the subscription checkout, this needs no Stripe
 * Price configured per rung — `createOneTimeCreditCheckout` inlines the amount — so it works the
 * moment an org exists, subscribed or not.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
  const { supabase, user, apiKey, error } = await authenticate(request);
  if (error) return error;

  const { brand, error: brandError } = await loadBrandForUser(supabase, params.slug, apiKey);
  if (brandError) return brandError;

  const readOnly = checkApiKeyWriteAccess(apiKey);
  if (readOnly) return readOnly;

  if (!(await billingGrantsReady(supabase))) {
    return json(
      { error: 'purchases_not_ready' },
      { status: statusForFailure(ONE_TIME_CHECKOUT_LINK, 'purchases_not_ready') }
    );
  }

  const parsed = ONE_TIME_CHECKOUT_LINK.input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: 'invalid_input', details: parsed.error.issues }, { status: 400 });
  }

  if (!(await isOrgOwner(supabase, brand.org_id, user.id))) {
    return json(
      { error: 'not_org_owner' },
      { status: statusForFailure(ONE_TIME_CHECKOUT_LINK, 'not_org_owner') }
    );
  }

  const rung = CREDIT_LADDER.find((r) => r.price === parsed.data.usd);
  if (!rung) {
    return json(
      { error: 'unknown_plan' },
      { status: statusForFailure(ONE_TIME_CHECKOUT_LINK, 'unknown_plan') }
    );
  }

  const billing = await orgBillingForBrand(supabase, { slug: params.slug });
  if (!billing) {
    return json(
      { error: 'no_org_billing' },
      { status: statusForFailure(ONE_TIME_CHECKOUT_LINK, 'no_org_billing') }
    );
  }

  const appBillingUrl = `${appOrigin(url)}/app/billing`;

  try {
    const { ensureOrgCustomer, createOneTimeCreditCheckout } = await import('$lib/server/stripe');
    const customerId = await ensureOrgCustomer({
      id: billing.orgId,
      name: billing.orgName,
      stripe_customer_id: billing.customerId
    });
    const checkoutUrl = await createOneTimeCreditCheckout({
      customerId,
      orgId: billing.orgId,
      price: rung.price,
      credits: rung.creditsOneTime,
      successUrl: appBillingUrl,
      cancelUrl: appBillingUrl
    });
    return json({ ok: true, url: checkoutUrl, credits: rung.creditsOneTime });
  } catch (e) {
    return json(
      { error: 'stripe_unavailable', message: e instanceof Error ? e.message : undefined },
      { status: statusForFailure(ONE_TIME_CHECKOUT_LINK, 'stripe_unavailable') }
    );
  }
};
