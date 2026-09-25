import { beforeEach, describe, expect, it, vi } from 'vitest';

const orgBillingForBrand = vi.fn();
const billingLink = vi.fn();
const ensureOrgCustomer = vi.fn();
const createSubscriptionCheckout = vi.fn();
const subscriptionPriceIdFor = vi.fn();
const billingGrantsReady = vi.fn();

vi.mock('$lib/server/org-billing', () => ({
	orgBillingForBrand: (...args: unknown[]) => orgBillingForBrand(...args),
	isOrgOwner: vi.fn()
}));
vi.mock('$lib/server/billing-links', () => ({
	billingLink: (...args: unknown[]) => billingLink(...args)
}));
vi.mock('$lib/server/stripe', () => ({
	ensureOrgCustomer: (...args: unknown[]) => ensureOrgCustomer(...args),
	createSubscriptionCheckout: (...args: unknown[]) => createSubscriptionCheckout(...args),
	subscriptionPriceIdFor: (...args: unknown[]) => subscriptionPriceIdFor(...args)
}));
vi.mock('$lib/server/billing-readiness', () => ({
	billingGrantsReady: (...args: unknown[]) => billingGrantsReady(...args)
}));

import { upgrade } from './settings-actions';

function ownerSupabase() {
	return {
		auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
		from: (table: string) => {
			if (table === 'brands') {
				return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { org_id: 'org-1' } }) }) }) };
			}
			if (table === 'orgs_members') {
				return {
					select: () => ({
						eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner' } }) }) })
					})
				};
			}
			throw new Error(`unexpected table ${table}`);
		}
	};
}

const ORG_BILLING_NO_SUBSCRIPTION = {
	orgId: 'org-1',
	orgName: 'Acme',
	customerId: 'cus_org',
	subscriptionId: null,
	brandCount: 1
};

const ORG_BILLING_WITH_SUBSCRIPTION = {
	orgId: 'org-1',
	orgName: 'Acme',
	customerId: 'cus_org',
	subscriptionId: 'sub_1',
	brandCount: 1
};

function formEvent(usd: string) {
	const data = new FormData();
	data.set('usd', usd);
	return {
		request: { formData: async () => data },
		params: { brand: 'demo' },
		url: new URL('https://feega.test/app/demo/settings/billing'),
		locals: { supabase: ownerSupabase() }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	billingGrantsReady.mockResolvedValue(true);
});

describe('upgrade — starting a first subscription for a ladder rung', () => {
	it('redirects straight to a real Checkout Session when no subscription exists yet', async () => {
		orgBillingForBrand.mockResolvedValue(ORG_BILLING_NO_SUBSCRIPTION);
		subscriptionPriceIdFor.mockReturnValue('price_sub_30');
		ensureOrgCustomer.mockResolvedValue('cus_org');
		createSubscriptionCheckout.mockResolvedValue('https://checkout.stripe.com/c/pay/cs_test_sub');

		await expect(upgrade(formEvent('30'))).rejects.toMatchObject({
			status: 303,
			location: 'https://checkout.stripe.com/c/pay/cs_test_sub'
		});
		expect(billingLink).not.toHaveBeenCalled();
		expect(createSubscriptionCheckout).toHaveBeenCalledWith(
			expect.objectContaining({ customerId: 'cus_org', orgId: 'org-1', priceId: 'price_sub_30', credits: 3000 })
		);
	});

	it('still goes through the hosted portal to CHANGE an existing subscription', async () => {
		orgBillingForBrand.mockResolvedValue(ORG_BILLING_WITH_SUBSCRIPTION);
		billingLink.mockResolvedValue({ url: 'https://portal/upgrade' });

		await expect(upgrade(formEvent('30'))).rejects.toMatchObject({ status: 303, location: 'https://portal/upgrade' });
		expect(createSubscriptionCheckout).not.toHaveBeenCalled();
	});

	it('fails plainly when the rung has no Stripe price configured, instead of minting a broken session', async () => {
		orgBillingForBrand.mockResolvedValue(ORG_BILLING_NO_SUBSCRIPTION);
		subscriptionPriceIdFor.mockReturnValue(undefined);

		const result = await upgrade(formEvent('30'));
		expect(result).toMatchObject({ status: 400, data: { billingError: expect.stringMatching(/not configured/i) } });
		expect(createSubscriptionCheckout).not.toHaveBeenCalled();
	});

	it('rejects a rung that is not on the ladder before touching Stripe', async () => {
		orgBillingForBrand.mockResolvedValue(ORG_BILLING_NO_SUBSCRIPTION);

		const result = await upgrade(formEvent('7'));
		expect(result).toMatchObject({ status: 400, data: { billingError: 'Unknown subscription tier' } });
		expect(subscriptionPriceIdFor).not.toHaveBeenCalled();
	});

	it('refuses to sell when a grant could not land — the sync engine trigger is not there yet', async () => {
		billingGrantsReady.mockResolvedValue(false);
		orgBillingForBrand.mockResolvedValue(ORG_BILLING_NO_SUBSCRIPTION);

		const result = await upgrade(formEvent('30'));
		expect(result).toMatchObject({ status: 409, data: { billingError: expect.stringMatching(/open soon/i) } });
		expect(orgBillingForBrand).not.toHaveBeenCalled();
		expect(createSubscriptionCheckout).not.toHaveBeenCalled();
		expect(billingLink).not.toHaveBeenCalled();
	});
});
