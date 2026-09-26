import { describe, expect, it, vi } from 'vitest';
import { chargeAccountSeat, renewAccountSeats } from './account-billing';
import { ACCOUNT_SEAT_CREDITS } from './credit-ladder';

/**
 * Il canone mensile per un account collegato: un debito `credit_ledger` (source 'social_seat'),
 * idempotente per account+mese sotto l'indice unico della migration pendente
 * (20260924_seat_fees_welcome_credits.sql). Senza saldo sufficiente l'account passa `paused`,
 * MAI tenuto gratis in silenzio ("non ci rimettiamo MAI", CLAUDE.md).
 */

function fakeDb(opts: { balance: number; alreadyChargedThisMonth?: boolean; updateOk?: boolean }) {
	const calls: { table: string; op: string; payload?: unknown }[] = [];
	return {
		calls,
		rpc: async (fn: string) => {
			calls.push({ table: 'rpc', op: fn });
			if (fn !== 'org_credit_balance') throw new Error(`unexpected rpc ${fn}`);
			return { data: opts.balance, error: null };
		},
		from: (table: string) => {
			if (table === 'credit_ledger') {
				return {
					insert: (payload: Record<string, unknown>) => {
						calls.push({ table, op: 'insert', payload });
						return Promise.resolve({
							error: opts.alreadyChargedThisMonth ? { code: '23505', message: 'duplicate' } : null
						});
					}
				};
			}
			if (table === 'social_accounts') {
				return {
					update: (payload: Record<string, unknown>) => {
						calls.push({ table, op: 'update', payload });
						return { eq: () => Promise.resolve({ error: opts.updateOk === false ? { message: 'db' } : null }) };
					}
				};
			}
			throw new Error(`unexpected table ${table}`);
		}
	};
}

const ACCOUNT = 'acct-1';
const ORG = 'org-1';

describe('chargeAccountSeat', () => {
	it('debits ACCOUNT_SEAT_CREDITS when the balance covers it', async () => {
		const db = fakeDb({ balance: ACCOUNT_SEAT_CREDITS + 100 });

		const outcome = await chargeAccountSeat(db as never, { accountId: ACCOUNT, orgId: ORG });

		expect(outcome).toBe('charged');
		const debit = db.calls.find((c) => c.table === 'credit_ledger')!.payload as Record<string, unknown>;
		expect(debit).toMatchObject({
			org_id: ORG,
			kind: 'debit',
			source: 'social_seat',
			amount: ACCOUNT_SEAT_CREDITS,
			social_account_id: ACCOUNT
		});
	});

	it('pauses the account instead of charging when the balance is short', async () => {
		const db = fakeDb({ balance: ACCOUNT_SEAT_CREDITS - 1 });

		const outcome = await chargeAccountSeat(db as never, { accountId: ACCOUNT, orgId: ORG });

		expect(outcome).toBe('paused_insufficient_balance');
		expect(db.calls.find((c) => c.table === 'credit_ledger' && c.op === 'insert')).toBeUndefined();
		const update = db.calls.find((c) => c.table === 'social_accounts')!.payload as Record<string, unknown>;
		expect(update).toMatchObject({ status: 'paused' });
	});

	it('a duplicate charge for the same account+month is idempotent, not an error', async () => {
		const db = fakeDb({ balance: ACCOUNT_SEAT_CREDITS + 100, alreadyChargedThisMonth: true });

		const outcome = await chargeAccountSeat(db as never, { accountId: ACCOUNT, orgId: ORG });

		expect(outcome).toBe('already_charged');
	});
});

describe('renewAccountSeats', () => {
	function fakeRenewDb(accounts: { id: string; org_id: string }[], balance: number) {
		const charged: string[] = [];
		const paused: string[] = [];
		return {
			rpc: async () => ({ data: balance, error: null }),
			from: (table: string) => {
				if (table === 'social_accounts') {
					return {
						select: () => ({ eq: () => Promise.resolve({ data: accounts, error: null }) }),
						update: (payload: Record<string, unknown>) => ({
							eq: (col: string, val: string) => {
								if ((payload as { status?: string }).status === 'paused') paused.push(val);
								return Promise.resolve({ error: null });
							}
						})
					};
				}
				if (table === 'credit_ledger') {
					return {
						insert: (payload: Record<string, unknown>) => {
							charged.push((payload as { social_account_id: string }).social_account_id);
							return Promise.resolve({ error: null });
						}
					};
				}
				throw new Error(`unexpected table ${table}`);
			},
			charged,
			paused
		};
	}

	it('charges every active account, one row per account', async () => {
		const db = fakeRenewDb(
			[
				{ id: 'a1', org_id: 'org-1' },
				{ id: 'a2', org_id: 'org-2' }
			],
			ACCOUNT_SEAT_CREDITS + 100
		);

		const result = await renewAccountSeats(db as never);

		expect(result).toEqual({ charged: 2, paused: 0, alreadyCharged: 0 });
		expect(db.charged).toEqual(['a1', 'a2']);
	});

	it('pauses an account whose org cannot cover the renewal', async () => {
		const db = fakeRenewDb([{ id: 'a1', org_id: 'org-1' }], ACCOUNT_SEAT_CREDITS - 1);

		const result = await renewAccountSeats(db as never);

		expect(result).toEqual({ charged: 0, paused: 1, alreadyCharged: 0 });
		expect(db.paused).toEqual(['a1']);
	});

	it('only queries active accounts — a paused one is not billed again by this pass', async () => {
		const db = fakeRenewDb([], ACCOUNT_SEAT_CREDITS + 100);
		const calls: unknown[][] = [];
		const eq = vi.fn((...args: unknown[]) => {
			calls.push(args);
			return Promise.resolve({ data: [], error: null });
		});
		db.from = ((table: string) => {
			if (table === 'social_accounts') return { select: () => ({ eq }) };
			throw new Error(`unexpected table ${table}`);
		}) as unknown as typeof db.from;

		await renewAccountSeats(db as never);

		expect(calls).toContainEqual(['status', 'active']);
	});
});
