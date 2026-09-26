import { z } from 'zod';
import type { BrandEndpoint, EndpointFailure } from './index';

const LinkSchema = z
  .string()
  .describe('One-time Stripe URL. Give it to the account owner and keep no copy');

const PlanSchema = z.object({ usd: z.number(), label: z.string() });

const PortalInputSchema = z.object({}).strict();

const PortalResultSchema = z.object({
  ok: z.literal(true),
  url: LinkSchema
});

const CheckoutInputSchema = z
  .object({
    usd: z
      .number()
      .positive()
      .optional()
      .describe('Monthly subscription rung the human wants, e.g. 30. Must be one of CREDIT_LADDER\'s prices')
  })
  .strict();

const CheckoutResultSchema = z.object({
  ok: z.literal(true),
  url: LinkSchema,
  plans: z.array(PlanSchema).describe('The subscription rungs the hosted page will offer')
});

/**
 * Reaching a brand is not authority over its organization's money, and a customer who cannot
 * pay is not a caller who typed something wrong: `no_customer` and `no_subscription` describe
 * an account that has not subscribed yet, and `stripe_unavailable` / `no_org_billing` are ours.
 */
const BILLING_FAILURES: readonly EndpointFailure[] = [
  { error: 'not_org_owner', status: 403 },
  { error: 'no_customer', status: 409 },
  { error: 'no_org_billing', status: 500 },
  { error: 'stripe_unavailable', status: 502 },
  { error: 'purchases_not_ready', status: 409 }
];

export type BillingPortalLinkResult = z.infer<typeof PortalResultSchema>;
export type CheckoutLinkInput = z.infer<typeof CheckoutInputSchema>;
export type CheckoutLinkResult = z.infer<typeof CheckoutResultSchema>;

export const BILLING_PORTAL_LINK = {
  tool: 'create_billing_portal_link',
  title: 'Billing portal link',
  description:
    'Mint a one-time link to this organization\'s Stripe billing portal and hand it to the account ' +
    'owner. On that page THEY can read invoices, change the card, switch plan and CANCEL the ' +
    'subscription — you never open it and never act inside it. Treat the URL as a credential: ' +
    'whoever holds it reaches that customer\'s billing, so give it to the owner once, in the ' +
    'reply, and never store or repeat it. Only the organization owner can mint one. Free: it ' +
    'works precisely when credits are gone.',
  method: 'POST',
  pathUnderBrand: '/billing/portal',
  input: PortalInputSchema,
  output: PortalResultSchema,
  failures: BILLING_FAILURES,
  destructive: false
} satisfies BrandEndpoint;

export const CHECKOUT_LINK = {
  tool: 'create_checkout_link',
  title: 'Checkout link',
  description:
    'Mint a one-time link where the human picks a paid plan and pays, on Stripe\'s own hosted ' +
    'page. You never pay, never change a plan and never apply a discount: you return the URL, ' +
    'they complete it. The same page can also CANCEL the subscription, so treat the URL as the ' +
    'owner credential — whoever holds it reaches that customer\'s billing — and hand it over once, ' +
    'never stored, never repeated. Only the organization owner can mint one. Free: it works ' +
    'precisely when credits are gone. An organization that never subscribed has no Stripe ' +
    'customer to check out against: the refusal carries app_billing_url, which is where the human ' +
    'starts.',
  method: 'POST',
  pathUnderBrand: '/billing/checkout',
  input: CheckoutInputSchema,
  output: CheckoutResultSchema,
  failures: [
    ...BILLING_FAILURES,
    { error: 'unknown_plan', status: 400 },
    { error: 'no_subscription', status: 409 },
    { error: 'subscriptions_not_configured', status: 409 }
  ],
  destructive: false
} satisfies BrandEndpoint;

const OneTimeCheckoutInputSchema = z
  .object({
    usd: z
      .number()
      .positive()
      .describe('A one-time ladder rung, e.g. 30. Must be one of CREDIT_LADDER\'s prices')
  })
  .strict();

const OneTimeCheckoutResultSchema = z.object({
  ok: z.literal(true),
  url: LinkSchema,
  credits: z.number().describe('Credits this purchase grants. Never expires.')
});

export type OneTimeCheckoutLinkInput = z.infer<typeof OneTimeCheckoutInputSchema>;
export type OneTimeCheckoutLinkResult = z.infer<typeof OneTimeCheckoutResultSchema>;

/**
 * A separate tool from CHECKOUT_LINK on purpose: a one-time purchase never touches a subscription
 * and never needs one to exist first (unlike the subscription rungs, which need a Stripe Price
 * configured per rung — see `subscriptionPriceIdFor` in `$lib/server/stripe`). It works for an
 * organization that has never subscribed and never will.
 */
export const ONE_TIME_CHECKOUT_LINK = {
  tool: 'create_one_time_checkout_link',
  title: 'One-time credit purchase link',
  description:
    'Mint a one-time link where the human buys a fixed batch of credits once, on Stripe\'s own ' +
    'hosted page — never a subscription. You never pay, never change a plan and never cancel ' +
    'anything: you return the URL, they complete it. These credits never expire. Only the ' +
    'organization owner can mint one. An organization with no Stripe customer yet gets one ' +
    'created on the spot — unlike the subscription link, there is nothing to check out AGAINST ' +
    'first.',
  method: 'POST',
  pathUnderBrand: '/billing/checkout/one-time',
  input: OneTimeCheckoutInputSchema,
  output: OneTimeCheckoutResultSchema,
  failures: [
    { error: 'not_org_owner', status: 403 },
    { error: 'no_org_billing', status: 500 },
    { error: 'stripe_unavailable', status: 502 },
    { error: 'unknown_plan', status: 400 },
    { error: 'purchases_not_ready', status: 409 }
  ],
  destructive: false
} satisfies BrandEndpoint;
