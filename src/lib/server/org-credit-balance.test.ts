import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Il cancello leggeva `ai_calls` sommato contro una quota fissa (il piano free, sempre — vedi
 * `orgCreditsUsage`) e non guardava mai `credit_ledger`: un'org che aveva COMPRATO crediti
 * restava tappata alla quota free per sempre, e uno sforamento non toccava un saldo vero. Qui si
 * prova che il cancello legge `org_credit_balance` (RPC) e nega quando il saldo è a zero, anche
 * con una spesa `ai_calls` piccola.
 */

const rpc = vi.fn();

vi.mock('./supabase-admin', () => ({
	createAdminClient: () => ({
		from: (table: string) => {
			if (table === 'brands') {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({ data: { id: 'brand-1', org_id: 'org-1' }, error: null })
						})
					})
				};
			}
			throw new Error(`unexpected table ${table}`);
		},
		rpc: (...args: unknown[]) => rpc(...args)
	})
}));

import { gateOrgCreditsCore, CreditsExhaustedError, orgCreditBalance } from './credits';

beforeEach(() => {
	rpc.mockReset();
});

describe('orgCreditBalance', () => {
	it('reads org_credit_balance for the org', async () => {
		rpc.mockResolvedValue({ data: 250, error: null });
		const admin = { rpc } as never;

		const balance = await orgCreditBalance(admin, 'org-1');

		expect(rpc).toHaveBeenCalledWith('org_credit_balance', { _org_id: 'org-1' });
		expect(balance).toBe(250);
	});
});

describe('gateOrgCreditsCore reads the ledger balance, not a fixed quota', () => {
	// gateOrgCreditsCore caches its verdict per org (60s TTL) — a real org id per test, not the
	// TTL, keeps these independent of each other and of test order.
	it('denies an org at zero balance', async () => {
		rpc.mockResolvedValue({ data: 0, error: null });

		await expect(gateOrgCreditsCore('org-zero')).rejects.toBeInstanceOf(CreditsExhaustedError);
	});

	it('allows an org with a purchased balance the free quota alone would never grant', async () => {
		rpc.mockResolvedValue({ data: 50_000, error: null });

		await expect(gateOrgCreditsCore('org-flush')).resolves.toBeUndefined();
	});

	it('denies once the purchased balance is fully spent', async () => {
		rpc.mockResolvedValue({ data: -1, error: null });

		await expect(gateOrgCreditsCore('org-overspent')).rejects.toBeInstanceOf(CreditsExhaustedError);
	});
});
