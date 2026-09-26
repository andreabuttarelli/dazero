import { describe, expect, it } from 'vitest';
import { orgBillingForBrand } from './org-billing';

type Row = Record<string, any>;

/**
 * orgs porta stripe_customer_id/stripe_subscription_id DIRETTAMENTE (20260922_org_billing.sql):
 * niente `organizations`, niente `brands.plan`/`brands.stripe_*` — quelle tabelle/colonne non
 * esistono sullo schema nuovo. Un brand non porta più nulla di suo: solo org_id, per risalire.
 */
function makeDb(org: Row | null, brands: Row[]) {
	return {
		from: (table: string) => {
			if (table === 'brands') {
				const filters: Record<string, unknown> = {};
				const matching = () => brands.filter((b) => Object.entries(filters).every(([k, v]) => b[k] === v));
				const chain = {
					select: () => chain,
					eq: (k: string, v: unknown) => {
						filters[k] = v;
						return chain;
					},
					maybeSingle: async () => {
						const row = matching()[0];
						return { data: row ? { org_id: row.org_id } : null, error: null };
					},
					then: (resolve: (v: { data: unknown; error: null }) => void) =>
						resolve({ data: matching().map((b) => ({ id: b.id })), error: null })
				};
				return chain;
			}
			if (table === 'orgs') {
				const chain = {
					select: () => chain,
					eq: () => chain,
					maybeSingle: async () => ({ data: org, error: null })
				};
				return chain;
			}
			throw new Error(`unexpected table ${table}`);
		}
	};
}

const ORG = {
	id: 'org-1',
	name: 'Acme',
	stripe_customer_id: 'cus_org',
	stripe_subscription_id: 'sub_org'
};

const NO_CUSTOMER = {
	id: 'org-1',
	name: 'Acme',
	stripe_customer_id: null,
	stripe_subscription_id: null
};

const PAYING_BRAND = { id: 'b1', slug: 'paying', org_id: 'org-1' };
const FREE_SIBLING = { id: 'b2', slug: 'free', org_id: 'org-1' };

describe('orgBillingForBrand', () => {
	it('reads the Stripe customer/subscription off orgs directly', async () => {
		const db = makeDb(ORG, [PAYING_BRAND]);
		const billing = await orgBillingForBrand(db as never, { slug: 'paying' });

		expect(billing).toMatchObject({
			orgId: 'org-1',
			orgName: 'Acme',
			customerId: 'cus_org',
			subscriptionId: 'sub_org'
		});
	});

	it('answers the same for a free brand of a paying org — billing belongs to the org', async () => {
		const db = makeDb(ORG, [FREE_SIBLING, PAYING_BRAND]);
		const billing = await orgBillingForBrand(db as never, { slug: 'free' });

		expect(billing).toMatchObject({ customerId: 'cus_org', subscriptionId: 'sub_org' });
	});

	it('reports no customer when the org never paid', async () => {
		const db = makeDb(NO_CUSTOMER, [FREE_SIBLING]);
		const billing = await orgBillingForBrand(db as never, { slug: 'free' });

		expect(billing).toMatchObject({ customerId: null, subscriptionId: null });
	});

	it('counts the org brands, so deleting one of several can spare the subscription', async () => {
		const db = makeDb(ORG, [PAYING_BRAND, FREE_SIBLING]);
		const billing = await orgBillingForBrand(db as never, { slug: 'paying' });

		expect(billing?.brandCount).toBe(2);
	});

	it('is null for a brand that is not there', async () => {
		const db = makeDb(ORG, [PAYING_BRAND]);
		expect(await orgBillingForBrand(db as never, { slug: 'ghost' })).toBeNull();
	});

	it('is null when the org row itself cannot be read', async () => {
		const db = makeDb(null, [PAYING_BRAND]);
		expect(await orgBillingForBrand(db as never, { slug: 'paying' })).toBeNull();
	});
});
