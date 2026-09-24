import type { SupabaseClient } from '@supabase/supabase-js';

// Which Stripe customer and subscription an org bills through. Billing is org-level, not brand-
// level (20260922_org_billing.sql: `orgs.stripe_customer_id`/`stripe_subscription_id` directly —
// no `organizations` table, no `brands.plan`/`brands.stripe_*`). One subscription covers every
// brand under the org — a free brand sitting next to a paying sibling answers with the SAME
// customer, never "nothing here".

export type OrgBilling = {
	orgId: string;
	/** Name Stripe shows the org on its own customer record — read once, at customer creation. */
	orgName: string;
	customerId: string | null;
	subscriptionId: string | null;
	/** Brands under the org — deleting one of several must not cancel what covers the others. */
	brandCount: number;
};

type OrgRow = {
	id: string;
	name: string;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
};

export async function orgBillingForBrand(
	supabase: SupabaseClient,
	brand: { slug?: string; id?: string }
): Promise<OrgBilling | null> {
	const key = brand.slug ? 'slug' : 'id';
	const value = brand.slug ?? brand.id;
	if (!value) return null;

	const { data: row } = await supabase
		.from('brands')
		.select('org_id')
		.eq(key, value)
		.maybeSingle();
	const orgId = (row as { org_id?: string } | null)?.org_id;
	if (!orgId) return null;

	return orgBillingById(supabase, orgId);
}

/** Same reading for a caller that already holds the org id and has no brand to reach it through. */
export async function orgBillingById(
	supabase: SupabaseClient,
	orgId: string
): Promise<OrgBilling | null> {
	const [{ data: orgData }, { data: brandRows }] = await Promise.all([
		supabase
			.from('orgs')
			.select('id, name, stripe_customer_id, stripe_subscription_id')
			.eq('id', orgId)
			.maybeSingle(),
		supabase.from('brands').select('id').eq('org_id', orgId)
	]);
	const org = orgData as OrgRow | null;
	if (!org) return null;

	return {
		orgId: org.id,
		orgName: org.name,
		customerId: org.stripe_customer_id,
		subscriptionId: org.stripe_subscription_id,
		brandCount: (brandRows ?? []).length
	};
}

/**
 * Billing authority, not brand access. A collaborator reaches a shared brand and must not reach
 * the owner's payment pages through it. Written out instead of leaned on RLS because the
 * API-key path runs as service role, where RLS proves nothing.
 */
export async function isOrgOwner(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<boolean> {
	const { data } = await supabase
		.from('orgs_members')
		.select('role')
		.eq('org_id', orgId)
		.eq('user_id', userId)
		.maybeSingle();
	return (data as { role?: string } | null)?.role === 'owner';
}
