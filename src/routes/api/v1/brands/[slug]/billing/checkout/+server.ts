import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, checkApiKeyWriteAccess, loadBrandForUser } from '$lib/server/cli-auth';
import { billingLink } from '$lib/server/billing-links';
import { isOrgOwner, orgBillingForBrand } from '$lib/server/org-billing';
import { billingGrantsReady } from '$lib/server/billing-readiness';
import { CREDIT_LADDER } from '$lib/server/credit-ladder';
import { appOrigin } from '$lib/server/app-url';
import { CHECKOUT_LINK, statusForFailure } from '@dazero/api-contracts';

const SUBSCRIPTION_RUNGS = CREDIT_LADDER.map((rung) => ({
  usd: rung.price,
  label: `$${rung.price}/mo`
}));

/**
 * The subscription checkout has no plan names left — only the credit-ladder rungs (a monthly
 * price, and how many credits it grants: CREDIT_LADDER). Without a rung (opening the plan picker)
 * this still proxies to the hosted portal, which can only CHANGE an existing subscription — so
 * that path still refuses `no_subscription` when there is none. With a rung picked, a missing
 * subscription is no longer a refusal: this mints a real Checkout Session on that rung's Stripe
 * Price (see `subscriptionPriceIdFor`), which is how a first subscription gets created at all.
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
      { status: statusForFailure(CHECKOUT_LINK, 'purchases_not_ready') }
    );
  }

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
  const rung = wanted != null ? CREDIT_LADDER.find((r) => r.price === wanted) : undefined;
  if (wanted != null && !rung) {
    return json(
      { error: 'unknown_plan', plans: SUBSCRIPTION_RUNGS },
      { status: statusForFailure(CHECKOUT_LINK, 'unknown_plan') }
    );
  }

  const billing = await orgBillingForBrand(supabase, { slug: params.slug });
  if (!billing) {
    return json({ error: 'no_org_billing' }, { status: statusForFailure(CHECKOUT_LINK, 'no_org_billing') });
  }

  if (rung && !billing.subscriptionId) {
    const { subscriptionPriceIdFor } = await import('$lib/server/stripe');
    const priceId = subscriptionPriceIdFor(rung.price);
    if (!priceId) {
      return json(
        { error: 'subscriptions_not_configured', app_billing_url: appBillingUrl },
        { status: statusForFailure(CHECKOUT_LINK, 'subscriptions_not_configured') }
      );
    }

    try {
      const { ensureOrgCustomer, createSubscriptionCheckout } = await import('$lib/server/stripe');
      const customerId = await ensureOrgCustomer({
        id: billing.orgId,
        name: billing.orgName,
        stripe_customer_id: billing.customerId
      });
      const checkoutUrl = await createSubscriptionCheckout({
        customerId,
        orgId: billing.orgId,
        priceId,
        credits: rung.creditsSubscription,
        successUrl: appBillingUrl,
        cancelUrl: appBillingUrl
      });
      return json({ ok: true, url: checkoutUrl, plans: SUBSCRIPTION_RUNGS });
    } catch (e) {
      return json(
        { error: 'stripe_unavailable', message: e instanceof Error ? e.message : undefined },
        { status: statusForFailure(CHECKOUT_LINK, 'stripe_unavailable') }
      );
    }
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
