import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const billingPortalSessionsCreate = vi.fn();
const subscriptionsRetrieve = vi.fn();
const subscriptionsUpdate = vi.fn();
const subscriptionsCancel = vi.fn();
const checkoutSessionsCreate = vi.fn();
const customersCreate = vi.fn();

vi.mock('$env/dynamic/private', () => ({
	env: {
		STRIPE_SECRET_KEY: 'sk_test_123',
		STRIPE_PRICE_ID_SUBSCRIPTION_5: 'price_sub_5',
		STRIPE_PRICE_ID_SUBSCRIPTION_15: 'price_sub_15'
	}
}));

vi.mock('stripe', () => ({
	default: class MockStripe {
		billingPortal = { sessions: { create: billingPortalSessionsCreate } };
		subscriptions = {
			retrieve: subscriptionsRetrieve,
			update: subscriptionsUpdate,
			cancel: subscriptionsCancel
		};
		checkout = { sessions: { create: checkoutSessionsCreate } };
		customers = { create: customersCreate };
	}
}));

const adminUpdateEq = vi.fn();
const adminUpdate = vi.fn(() => ({ eq: adminUpdateEq }));
const adminFrom = vi.fn(() => ({ update: adminUpdate }));

vi.mock('./supabase-admin', () => ({
	createAdminClient: () => ({ from: adminFrom })
}));

beforeEach(() => {
	vi.resetModules();
	billingPortalSessionsCreate.mockReset();
	subscriptionsRetrieve.mockReset();
	subscriptionsUpdate.mockReset();
	subscriptionsCancel.mockReset();
	checkoutSessionsCreate.mockReset();
	customersCreate.mockReset();
	adminUpdateEq.mockReset().mockResolvedValue({ error: null });
	adminUpdate.mockClear();
	adminFrom.mockClear();
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('createBillingPortalSession', () => {
	it('opens the portal home when no flow is requested', async () => {
		billingPortalSessionsCreate.mockResolvedValue({ url: 'https://portal/home' });
		const { createBillingPortalSession } = await import('./stripe');

		const url = await createBillingPortalSession({
			customerId: 'cus_1',
			returnUrl: 'https://app/return',
			flow: undefined,
			subscriptionId: 'sub_1'
		});

		expect(url).toBe('https://portal/home');
		expect(billingPortalSessionsCreate).toHaveBeenCalledWith({
			customer: 'cus_1',
			return_url: 'https://app/return'
		});
	});

	it('requests the payment_method_update flow', async () => {
		billingPortalSessionsCreate.mockResolvedValue({ url: 'https://portal/pm' });
		const { createBillingPortalSession } = await import('./stripe');

		await createBillingPortalSession({
			customerId: 'cus_1',
			returnUrl: 'https://app/return',
			flow: 'payment_method',
			subscriptionId: 'sub_1'
		});

		expect(billingPortalSessionsCreate).toHaveBeenCalledWith({
			customer: 'cus_1',
			return_url: 'https://app/return',
			flow_data: { type: 'payment_method_update' }
		});
	});

	it('sends an upgrade to the portal to pick the plan, naming no price', async () => {
		billingPortalSessionsCreate.mockResolvedValue({ url: 'https://portal/upgrade' });
		const { createBillingPortalSession } = await import('./stripe');

		await createBillingPortalSession({
			customerId: 'cus_1',
			returnUrl: 'https://app/return',
			flow: 'upgrade',
			subscriptionId: 'sub_1'
		});

		expect(billingPortalSessionsCreate).toHaveBeenCalledWith({
			customer: 'cus_1',
			return_url: 'https://app/return',
			flow_data: { type: 'subscription_update', subscription_update: { subscription: 'sub_1' } }
		});
		expect(subscriptionsRetrieve).not.toHaveBeenCalled();
	});
});

describe('applyRetentionCoupon', () => {
	it('applies the coupon to the subscription', async () => {
		const { applyRetentionCoupon } = await import('./stripe');
		await applyRetentionCoupon('sub_1', 'SAVE20');
		// `coupon` was removed from subscription updates in the API version this SDK pins
		// (2026-08-26.dahlia); sending it back would be a 400 "unknown parameter".
		expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
			discounts: [{ coupon: 'SAVE20' }]
		});
	});
});

describe('cancelSubscriptionAtPeriodEnd', () => {
	it('schedules the cancellation and returns the end date', async () => {
		subscriptionsUpdate.mockResolvedValue({ cancel_at: 1735689600 });
		const { cancelSubscriptionAtPeriodEnd } = await import('./stripe');

		const { endsAt } = await cancelSubscriptionAtPeriodEnd('sub_1', {
			feedback: 'too_expensive',
			comment: 'pricey'
		});

		expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
			cancel_at_period_end: true,
			cancellation_details: { feedback: 'too_expensive', comment: 'pricey' }
		});
		expect(endsAt).toBe(new Date(1735689600 * 1000).toISOString());
	});

	it('returns null when Stripe reports no cancel_at date', async () => {
		subscriptionsUpdate.mockResolvedValue({ cancel_at: null });
		const { cancelSubscriptionAtPeriodEnd } = await import('./stripe');

		const { endsAt } = await cancelSubscriptionAtPeriodEnd('sub_1', {});
		expect(endsAt).toBeNull();
	});
});

describe('ensureSubscriptionCanceled', () => {
	it('resolves silently when the subscription is already canceled', async () => {
		subscriptionsRetrieve.mockResolvedValue({ status: 'canceled' });
		const { ensureSubscriptionCanceled } = await import('./stripe');
		await expect(ensureSubscriptionCanceled('sub_1')).resolves.toBeUndefined();
	});

	it('throws active_plan when the subscription is still active', async () => {
		subscriptionsRetrieve.mockResolvedValue({ status: 'active' });
		const { ensureSubscriptionCanceled } = await import('./stripe');
		await expect(ensureSubscriptionCanceled('sub_1')).rejects.toThrow('active_plan');
	});

	// The owner used "cancel plan", was told it was cancelled, and Stripe keeps the status
	// `active` until the period runs out. Refusing here left them unable to delete their own
	// brand for up to a month.
	it('lets the delete through once cancellation is scheduled', async () => {
		subscriptionsRetrieve.mockResolvedValue({ status: 'active', cancel_at_period_end: true });
		const { ensureSubscriptionCanceled } = await import('./stripe');
		await expect(ensureSubscriptionCanceled('sub_1')).resolves.toBeUndefined();
	});

	it.each(['incomplete_expired', 'unpaid'])(
		'lets the delete through on the settled status %s',
		async (status) => {
			subscriptionsRetrieve.mockResolvedValue({ status });
			const { ensureSubscriptionCanceled } = await import('./stripe');
			await expect(ensureSubscriptionCanceled('sub_1')).resolves.toBeUndefined();
		}
	);

	// A stale id bills nobody. Refusing on it made the brand undeletable forever.
	it('lets the delete through when Stripe no longer knows the subscription', async () => {
		subscriptionsRetrieve.mockRejectedValue(
			Object.assign(new Error('No such subscription'), { code: 'resource_missing' })
		);
		const { ensureSubscriptionCanceled } = await import('./stripe');
		await expect(ensureSubscriptionCanceled('sub_1')).resolves.toBeUndefined();
	});

	// Failing open on an outage would delete a brand whose subscription is still charging.
	it('refuses when Stripe fails for any other reason', async () => {
		subscriptionsRetrieve.mockRejectedValue(
			Object.assign(new Error('connection error'), { code: 'api_connection_error' })
		);
		const { ensureSubscriptionCanceled } = await import('./stripe');
		await expect(ensureSubscriptionCanceled('sub_1')).rejects.toThrow('connection error');
	});
});

describe('ensureOrgCustomer', () => {
	it('returns the existing customer id without calling Stripe', async () => {
		const { ensureOrgCustomer } = await import('./stripe');
		const id = await ensureOrgCustomer({ id: 'org_1', name: 'Acme', stripe_customer_id: 'cus_existing' });
		expect(id).toBe('cus_existing');
		expect(customersCreate).not.toHaveBeenCalled();
	});

	it('creates a customer tagged with the org id and persists it on orgs', async () => {
		customersCreate.mockResolvedValue({ id: 'cus_new' });
		const { ensureOrgCustomer } = await import('./stripe');

		const id = await ensureOrgCustomer({ id: 'org_1', name: 'Acme', stripe_customer_id: null });

		expect(id).toBe('cus_new');
		expect(customersCreate).toHaveBeenCalledWith({ name: 'Acme', metadata: { org_id: 'org_1' } });
		expect(adminFrom).toHaveBeenCalledWith('orgs');
		expect(adminUpdate).toHaveBeenCalledWith({ stripe_customer_id: 'cus_new' });
		expect(adminUpdateEq).toHaveBeenCalledWith('id', 'org_1');
	});
});

describe('subscriptionPriceIdFor', () => {
	it('returns the configured price id for a rung with one set', async () => {
		const { subscriptionPriceIdFor } = await import('./stripe');
		expect(subscriptionPriceIdFor(5)).toBe('price_sub_5');
		expect(subscriptionPriceIdFor(15)).toBe('price_sub_15');
	});

	it('returns undefined for a rung with no price id configured', async () => {
		const { subscriptionPriceIdFor } = await import('./stripe');
		expect(subscriptionPriceIdFor(30)).toBeUndefined();
	});
});

describe('createOneTimeCreditCheckout', () => {
	it('creates a payment-mode session carrying org id and credits in metadata', async () => {
		checkoutSessionsCreate.mockResolvedValue({ url: 'https://checkout/one-time' });
		const { createOneTimeCreditCheckout } = await import('./stripe');

		const url = await createOneTimeCreditCheckout({
			customerId: 'cus_1',
			orgId: 'org_1',
			price: 100,
			credits: 7840,
			successUrl: 'https://app/return?ok=1',
			cancelUrl: 'https://app/return?cancel=1'
		});

		expect(url).toBe('https://checkout/one-time');
		expect(checkoutSessionsCreate).toHaveBeenCalledWith({
			mode: 'payment',
			customer: 'cus_1',
			line_items: [
				{
					price_data: {
						currency: 'usd',
						unit_amount: 10000,
						product_data: { name: '7840 feega credits' }
					},
					quantity: 1
				}
			],
			success_url: 'https://app/return?ok=1',
			cancel_url: 'https://app/return?cancel=1',
			metadata: { org_id: 'org_1', credits: '7840' }
		});
	});

	it('throws when Stripe returns no checkout URL', async () => {
		checkoutSessionsCreate.mockResolvedValue({ url: null });
		const { createOneTimeCreditCheckout } = await import('./stripe');

		await expect(
			createOneTimeCreditCheckout({
				customerId: 'cus_1',
				orgId: 'org_1',
				price: 5,
				credits: 350,
				successUrl: 'https://app/return',
				cancelUrl: 'https://app/return'
			})
		).rejects.toThrow('Stripe: no checkout URL');
	});
});

describe('createSubscriptionCheckout', () => {
	it('creates a subscription-mode session on the configured price, tagged for the org', async () => {
		checkoutSessionsCreate.mockResolvedValue({ url: 'https://checkout/sub' });
		const { createSubscriptionCheckout } = await import('./stripe');

		const url = await createSubscriptionCheckout({
			customerId: 'cus_1',
			orgId: 'org_1',
			priceId: 'price_sub_5',
			credits: 500,
			successUrl: 'https://app/return?ok=1',
			cancelUrl: 'https://app/return?cancel=1'
		});

		expect(url).toBe('https://checkout/sub');
		expect(checkoutSessionsCreate).toHaveBeenCalledWith({
			mode: 'subscription',
			customer: 'cus_1',
			line_items: [{ price: 'price_sub_5', quantity: 1 }],
			success_url: 'https://app/return?ok=1',
			cancel_url: 'https://app/return?cancel=1',
			subscription_data: { metadata: { org_id: 'org_1', credits: '500' } },
			metadata: { org_id: 'org_1' }
		});
	});

	it('throws when Stripe returns no checkout URL', async () => {
		checkoutSessionsCreate.mockResolvedValue({ url: undefined });
		const { createSubscriptionCheckout } = await import('./stripe');

		await expect(
			createSubscriptionCheckout({
				customerId: 'cus_1',
				orgId: 'org_1',
				priceId: 'price_sub_5',
				credits: 500,
				successUrl: 'https://app/return',
				cancelUrl: 'https://app/return'
			})
		).rejects.toThrow('Stripe: no checkout URL');
	});
});
