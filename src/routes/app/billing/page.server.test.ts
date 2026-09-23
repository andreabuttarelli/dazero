import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The account-level billing page answers for the ORGANIZATION: one credit balance, one Stripe
 * customer, and a per-brand table that says who is spending it. `organizations` doesn't exist on
 * this schema — the org's Stripe ids live on `orgs` directly, and there's no `plan` column
 * anywhere: the pool is the credit_ledger balance (org_credit_balance), not a quota tied to a
 * plan name.
 */

const orgCreditBalance = vi.fn();
const ensureOrgForUser = vi.fn();
const billingPortal = vi.fn();

vi.mock('$lib/server/credits', () => ({
	orgCreditBalance: (...a: unknown[]) => orgCreditBalance(...a)
}));
vi.mock('$lib/server/org', () => ({
	ensureOrgForUser: (...a: unknown[]) => ensureOrgForUser(...a)
}));
vi.mock('$lib/server/settings-actions', () => ({
	billingPortal: (...a: unknown[]) => billingPortal(...a),
	upgrade: vi.fn(),
	applyRetention: vi.fn(),
	cancelPlan: vi.fn()
}));

import { load, actions } from './+page.server';

type OrgRow = { id: string; name: string; stripe_customer_id: string | null };
type Membership = { role: string };
type BrandRow = { id: string; name: string; slug: string };

/** orgs + orgs_members (owner check) + brands (by org_id) + ai_calls (per-brand spend, summed in JS). */
function fakeSupabase(
	org: OrgRow | null,
	membership: Membership | null,
	brands: BrandRow[],
	costUsdByBrand: Record<string, number> = {}
) {
	return {
		auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'ana@example.com' } } }) },
		from: (table: string) => {
			if (table === 'orgs') {
				return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: org, error: null }) }) }) };
			}
			if (table === 'orgs_members') {
				return {
					select: () => ({
						eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) })
					})
				};
			}
			if (table === 'brands') {
				const q: Record<string, unknown> = {};
				Object.assign(q, {
					select: () => q,
					eq: () => q,
					limit: () => q,
					maybeSingle: async () => ({ data: brands[0] ?? null, error: null }),
					then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: brands, error: null })
				});
				return q;
			}
			if (table === 'ai_calls') {
				const q: Record<string, unknown> = {};
				let brandId: string | undefined;
				Object.assign(q, {
					select: () => q,
					eq: (col: string, val: string) => {
						if (col === 'brand_id') brandId = val;
						return q;
					},
					gte: () => q,
					lt: () => q,
					then: (resolve: (v: { data: unknown; error: null }) => void) =>
						resolve({ data: [{ cost_usd: costUsdByBrand[brandId ?? ''] ?? 0 }], error: null })
				});
				return q;
			}
			throw new Error(`unexpected table ${table}`);
		}
	};
}

function run(supabase: unknown) {
	return (load as (e: unknown) => Promise<Record<string, any>>)({
		locals: { supabase },
		url: new URL('https://example.test/app/billing')
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	orgCreditBalance.mockResolvedValue(3600);
	ensureOrgForUser.mockResolvedValue('org-1');
});

describe('/app/billing', () => {
	it('shows the org credit balance once, not a per-brand quota', async () => {
		const data = await run(
			fakeSupabase(
				{ id: 'org-1', name: 'Ana', stripe_customer_id: 'cus_1' },
				{ role: 'owner' },
				[
					{ id: 'b1', name: 'One', slug: 'one' },
					{ id: 'b2', name: 'Two', slug: 'two' }
				]
			)
		);

		expect(orgCreditBalance).toHaveBeenCalledTimes(1);
		expect(data.credits.balance).toBe(3600);
		expect(data.org.name).toBe('Ana');
	});

	it('breaks usage down over every brand of the org', async () => {
		const data = await run(
			fakeSupabase(
				{ id: 'org-1', name: 'Ana', stripe_customer_id: 'cus_1' },
				{ role: 'owner' },
				[
					{ id: 'b1', name: 'One', slug: 'one' },
					{ id: 'b2', name: 'Two', slug: 'two' }
				],
				{ b1: 3, b2: 1 }
			)
		);

		expect(data.brands).toEqual([
			{ id: 'b1', name: 'One', slug: 'one', credits: 600 },
			{ id: 'b2', name: 'Two', slug: 'two', credits: 200 }
		]);
	});

	it('has billing once the org carries a Stripe customer', async () => {
		const data = await run(
			fakeSupabase({ id: 'org-1', name: 'Ana', stripe_customer_id: 'cus_1' }, { role: 'owner' }, [
				{ id: 'b1', name: 'One', slug: 'one' }
			])
		);

		expect(data.hasBilling).toBe(true);
		expect(data.billingBrandSlug).toBe('one');
	});

	it('runs a billing action against the first org brand', async () => {
		const supabase = fakeSupabase({ id: 'org-1', name: 'Ana', stripe_customer_id: 'cus_1' }, { role: 'owner' }, [
			{ id: 'b1', name: 'One', slug: 'one' },
			{ id: 'b2', name: 'Two', slug: 'two' }
		]);

		await (actions.billingPortal as (e: unknown) => Promise<unknown>)({
			locals: { supabase },
			params: {}
		});

		expect(billingPortal).toHaveBeenCalledTimes(1);
		expect(billingPortal.mock.calls[0][0].params).toEqual({ brand: 'one' });
	});

	it('has no billing brand to act through when the org has no brands', async () => {
		const data = await run(
			fakeSupabase({ id: 'org-1', name: 'Ana', stripe_customer_id: null }, { role: 'owner' }, [])
		);

		expect(data.brands).toEqual([]);
		expect(data.billingBrandSlug).toBeNull();
	});

	it('reads the org owner status from orgs_members, not organizations.owner_id', async () => {
		const data = await run(
			fakeSupabase({ id: 'org-1', name: 'Ana', stripe_customer_id: 'cus_1' }, { role: 'member' }, [
				{ id: 'b1', name: 'One', slug: 'one' }
			])
		);

		expect(data.isOwner).toBe(false);
	});
});
