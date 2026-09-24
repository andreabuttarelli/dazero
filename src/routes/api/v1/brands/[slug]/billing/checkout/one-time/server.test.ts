import { beforeEach, describe, expect, it, vi } from 'vitest';

const orgBillingForBrand = vi.fn();
const isOrgOwner = vi.fn();
const ensureOrgCustomer = vi.fn();
const createOneTimeCreditCheckout = vi.fn();
const billingGrantsReady = vi.fn();

vi.mock('$lib/server/cli-auth', () => ({
	authenticate: vi.fn(),
	loadBrandForUser: vi.fn(),
	checkApiKeyWriteAccess: vi.fn(() => undefined)
}));
vi.mock('$lib/server/org-billing', () => ({
	orgBillingForBrand: (...args: unknown[]) => orgBillingForBrand(...args),
	isOrgOwner: (...args: unknown[]) => isOrgOwner(...args)
}));
vi.mock('$lib/server/stripe', () => ({
	ensureOrgCustomer: (...args: unknown[]) => ensureOrgCustomer(...args),
	createOneTimeCreditCheckout: (...args: unknown[]) => createOneTimeCreditCheckout(...args)
}));
vi.mock('$lib/server/billing-readiness', () => ({
	billingGrantsReady: (...args: unknown[]) => billingGrantsReady(...args)
}));
vi.mock('$lib/server/app-url', () => ({ appOrigin: () => 'https://dazero.test' }));

import { POST } from './+server';
import { authenticate, loadBrandForUser, checkApiKeyWriteAccess } from '$lib/server/cli-auth';

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_one_time';

const ORG_BILLING = {
	orgId: 'org-1',
	orgName: 'Acme',
	customerId: 'cus_org',
	subscriptionId: null,
	brandCount: 1
};

const ORG_BILLING_NO_CUSTOMER = {
	orgId: 'org-1',
	orgName: 'Acme',
	customerId: null,
	subscriptionId: null,
	brandCount: 1
};

function call(body: unknown = { usd: 30 }, slug = 'demo') {
	const url = new URL(`https://dazero.test/api/v1/brands/${slug}/billing/checkout/one-time`);
	return (POST as (event: unknown) => Promise<Response>)({
		request: new Request(url, { method: 'POST', body: JSON.stringify(body) }),
		params: { slug },
		url
	}).then(async (res) => ({ res, body: await res.json().catch(() => null) }));
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(authenticate).mockResolvedValue({
		supabase: {},
		user: { id: 'user-1' },
		apiKey: undefined,
		error: null
	} as never);
	vi.mocked(loadBrandForUser).mockResolvedValue({
		brand: { id: 'brand-1', org_id: 'org-1', slug: 'demo' },
		error: null
	} as never);
	vi.mocked(checkApiKeyWriteAccess).mockReturnValue(undefined);
	isOrgOwner.mockResolvedValue(true);
	orgBillingForBrand.mockResolvedValue(ORG_BILLING);
	ensureOrgCustomer.mockResolvedValue('cus_org');
	createOneTimeCreditCheckout.mockResolvedValue(CHECKOUT_URL);
	billingGrantsReady.mockResolvedValue(true);
});

describe('POST /api/v1/brands/:slug/billing/checkout/one-time', () => {
	it('creates a payment-mode session for the ladder rung and returns its credits', async () => {
		const { res, body } = await call({ usd: 30 });

		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.url).toBe(CHECKOUT_URL);
		expect(body.credits).toBe(2100);
		expect(createOneTimeCreditCheckout).toHaveBeenCalledWith({
			customerId: 'cus_org',
			orgId: 'org-1',
			price: 30,
			credits: 2100,
			successUrl: 'https://dazero.test/app/billing',
			cancelUrl: 'https://dazero.test/app/billing'
		});
	});

	it('creates the org Stripe customer on the spot when none exists yet — no subscription required first', async () => {
		orgBillingForBrand.mockResolvedValue(ORG_BILLING_NO_CUSTOMER);

		const { res } = await call({ usd: 30 });

		expect(res.status).toBe(200);
		expect(ensureOrgCustomer).toHaveBeenCalledWith({
			id: 'org-1',
			name: 'Acme',
			stripe_customer_id: null
		});
	});

	it('rejects a rung that is not on the ladder before touching Stripe', async () => {
		const { res, body } = await call({ usd: 7 });

		expect(res.status).toBe(400);
		expect(body.error).toBe('unknown_plan');
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('requires usd — there is no picker mode for a one-time purchase', async () => {
		const { res, body } = await call({});

		expect(res.status).toBe(400);
		expect(body.error).toBe('invalid_input');
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('checks the owner against the org the brand belongs to', async () => {
		await call({ usd: 30 });
		expect(isOrgOwner).toHaveBeenCalledWith(expect.anything(), 'org-1', 'user-1');
	});

	it('refuses a caller who reaches the brand but does not own the org billing', async () => {
		isOrgOwner.mockResolvedValue(false);

		const { res, body } = await call({ usd: 30 });

		expect(res.status).toBe(403);
		expect(body.error).toBe('not_org_owner');
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('a Stripe outage is ours: 502, not a 4xx that accuses the caller', async () => {
		createOneTimeCreditCheckout.mockRejectedValue(new Error('connection error'));

		const { res, body } = await call({ usd: 30 });

		expect(res.status).toBe(502);
		expect(body.error).toBe('stripe_unavailable');
	});

	it('rejects a request without authentication', async () => {
		vi.mocked(authenticate).mockResolvedValue({
			error: new Response('Unauthorized', { status: 401 })
		} as never);

		const { res } = await call();

		expect(res.status).toBe(401);
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('rejects a brand the caller cannot reach', async () => {
		vi.mocked(loadBrandForUser).mockResolvedValue({
			error: new Response(JSON.stringify({ error: 'Brand not found' }), { status: 404 })
		} as never);

		const { res } = await call({ usd: 30 }, 'altrui');

		expect(res.status).toBe(404);
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('rejects a read-only API key', async () => {
		vi.mocked(checkApiKeyWriteAccess).mockReturnValue(
			new Response(JSON.stringify({ error: 'API key is read-only' }), { status: 403 }) as never
		);

		const { res } = await call({ usd: 30 });

		expect(res.status).toBe(403);
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('rejects a field the contract never declared instead of ignoring it', async () => {
		const { res, body } = await call({ usd: 30, coupon: 'FREE' });

		expect(res.status).toBe(400);
		expect(body.error).toBe('invalid_input');
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});

	it('refuses to sell when a grant could not land — the sync engine trigger is not there yet', async () => {
		billingGrantsReady.mockResolvedValue(false);

		const { res, body } = await call({ usd: 30 });

		expect(res.status).toBe(409);
		expect(body.error).toBe('purchases_not_ready');
		expect(createOneTimeCreditCheckout).not.toHaveBeenCalled();
	});
});
