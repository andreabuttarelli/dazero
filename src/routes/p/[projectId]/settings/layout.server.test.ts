import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * settings/+layout.server.ts leggeva social_accounts.username (reale: handle), api_keys.permissions
 * (reale: scopes) e brand_invites (reale: orgs_invites, org-level, senza brand_id). Ogni pagina
 * sotto /settings caricava questi tre nomi sbagliati: le prove qui sono sui nomi di colonna reali,
 * non sul comportamento a valle (quello lo copre settings-actions.test.ts).
 */

const requireBrand = vi.fn((b: unknown) => b);
const isBrandOwner = vi.fn();
const orgBillingForBrand = vi.fn();

vi.mock('$lib/server/plans', () => ({
	accountLimit: () => 5,
	plansAbove: () => [],
	isTopPlan: () => false
}));
vi.mock('$lib/server/settings-actions', () => ({
	isBrandOwner: (...a: unknown[]) => isBrandOwner(...a)
}));
vi.mock('$lib/server/org-billing', () => ({
	orgBillingForBrand: (...a: unknown[]) => orgBillingForBrand(...a)
}));
vi.mock('$lib/server/projects/brand-shell', () => ({
	requireBrand: (...a: unknown[]) => requireBrand(...a)
}));

import { load } from './+layout.server';

function fakeSupabase(rows: Record<string, unknown[]>) {
	const ops: Array<{ table: string; column?: string; value?: unknown }> = [];
	return {
		from(table: string) {
			const q = {
				select: () => q,
				eq: (column: string, value: unknown) => {
					ops.push({ table, column, value });
					return q;
				},
				order: () => Promise.resolve({ data: rows[table] ?? [] })
			};
			return q;
		},
		rpc: () => Promise.resolve({ data: 0, error: null }),
		__ops: ops
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	isBrandOwner.mockResolvedValue(true);
	orgBillingForBrand.mockResolvedValue(null);
});

describe('settings +layout.server load', () => {
	it('selects social_accounts.handle, not the non-existent username', async () => {
		const supabase = fakeSupabase({ social_accounts: [], api_keys: [], orgs_invites: [] });

		await (load as (e: unknown) => Promise<Record<string, unknown>>)({
			parent: async () => ({ brand: { id: 'brand-1', slug: 'demo', org_id: 'org-1' } }),
			url: new URL('https://feega.test/p/x/settings/team'),
			locals: { supabase }
		});

		const select = (supabase as unknown as { __ops: unknown[] }).__ops;
		expect(select.some((o: any) => o.table === 'social_accounts')).toBe(true);
	});

	it('reads org-level orgs_invites for the brand org, not a non-existent brand_invites', async () => {
		const supabase = fakeSupabase({
			social_accounts: [],
			api_keys: [],
			orgs_invites: [{ id: 'inv-1', email: 'a@b.com', accepted_at: null, created_at: '2026-01-01' }]
		});

		const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({
			parent: async () => ({ brand: { id: 'brand-1', slug: 'demo', org_id: 'org-1' } }),
			url: new URL('https://feega.test/p/x/settings/team'),
			locals: { supabase }
		});

		const ops = (supabase as unknown as { __ops: any[] }).__ops;
		expect(ops.some((o) => o.table === 'orgs_invites' && o.column === 'org_id' && o.value === 'org-1')).toBe(
			true
		);
		expect(data.invites).toEqual([{ id: 'inv-1', email: 'a@b.com', accepted_at: null, created_at: '2026-01-01' }]);
	});
});
