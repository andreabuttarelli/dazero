import { describe, expect, it, vi } from 'vitest';

const gateCreditsCoreMock = vi.fn(async () => {});
const orgPlanForBrandMock = vi.fn(async (): Promise<string | null> => null);
vi.mock('$lib/server/credits', () => ({
	gateCreditsCore: gateCreditsCoreMock,
	orgPlanForBrand: orgPlanForBrandMock,
	creditQuota: (plan: string | null | undefined) => (plan === 'pro' ? 4000 : 400)
}));
vi.mock('$lib/server/supabase-admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('$lib/server/plans', () => ({
	postQuota: (plan: string | null | undefined) => (plan === 'pro' ? 90 : 15),
	plansAbove: (plan: string | null | undefined) => (plan === 'pro' ? [] : [{ key: 'pro' }]),
	isTopPlan: (plan: string | null | undefined) => plan === 'pro'
}));

describe('dazeroBillingProvider', () => {
	it('gate("credits", ...) calls the real enforcement, not a no-op', async () => {
		const { dazeroBillingProvider } = await import('./dazero-provider');
		await dazeroBillingProvider.gate('credits', { brandId: 'brand-1' });
		expect(gateCreditsCoreMock).toHaveBeenCalledWith('brand-1');
	});

	it('gate("credits", ...) propagates a denial from gateCreditsCore', async () => {
		gateCreditsCoreMock.mockRejectedValueOnce(new Error('exhausted'));
		const { dazeroBillingProvider } = await import('./dazero-provider');
		await expect(dazeroBillingProvider.gate('credits', { brandId: 'brand-1' })).rejects.toThrow(
			'exhausted'
		);
	});

	it('quota("credits", ...) reads the real per-plan quota', async () => {
		const { dazeroBillingProvider } = await import('./dazero-provider');
		await expect(dazeroBillingProvider.quota('credits', { brandId: 'b', plan: 'pro' })).resolves.toBe(
			4000
		);
		await expect(dazeroBillingProvider.quota('credits', { brandId: 'b', plan: null })).resolves.toBe(
			400
		);
	});

	it('quota("posts", ...) reads the real per-plan quota', async () => {
		const { dazeroBillingProvider } = await import('./dazero-provider');
		await expect(dazeroBillingProvider.quota('posts', { brandId: 'b', plan: 'pro' })).resolves.toBe(
			90
		);
	});

	it("quota answers on the org's plan, not the brand plan the caller passed", async () => {
		// After an org migrates, a caller's ctx.plan is the brand's frozen rollback copy. The org
		// is the one paying, so it decides the quota.
		orgPlanForBrandMock.mockResolvedValueOnce('pro');
		const { dazeroBillingProvider } = await import('./dazero-provider');
		await expect(dazeroBillingProvider.quota('posts', { brandId: 'b', plan: null })).resolves.toBe(
			90
		);
	});

	it('keeps the caller-supplied plan when the org cannot be resolved', async () => {
		orgPlanForBrandMock.mockRejectedValueOnce(new Error('supabase down'));
		const { dazeroBillingProvider } = await import('./dazero-provider');
		await expect(dazeroBillingProvider.quota('posts', { brandId: 'b', plan: 'pro' })).resolves.toBe(
			90
		);
	});

	it('plansAbove/isTopPlan delegate to the real plan ladder', async () => {
		const { dazeroBillingProvider } = await import('./dazero-provider');
		expect(dazeroBillingProvider.plansAbove('pro')).toEqual([]);
		expect(dazeroBillingProvider.isTopPlan('pro')).toBe(true);
		expect(dazeroBillingProvider.isTopPlan(null)).toBe(false);
	});

	it('upgradeUrl points at the brand billing settings when a slug is known', async () => {
		const { dazeroBillingProvider } = await import('./dazero-provider');
		expect(dazeroBillingProvider.upgradeUrl({ brandId: 'b', brandSlug: 'demo' })).toBe(
			'/app/demo/settings/billing'
		);
		expect(dazeroBillingProvider.upgradeUrl({ brandId: 'b' })).toBeUndefined();
	});
});
