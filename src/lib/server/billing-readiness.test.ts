import { describe, expect, it, vi } from 'vitest';
import { billingGrantsReady } from './billing-readiness';

/**
 * Purchases must refuse until a Stripe payment can actually reach `credit_ledger`. Before the
 * Supabase Stripe Sync Engine is installed and `20260924_stripe_sync_grants.sql` applied,
 * `public.billing_grants_ready()` either does not exist yet or answers false: both must fail
 * closed, never open — an RPC error is not proof the gate is closed, but it must be treated as
 * exactly that, because the alternative is a paid customer who receives nothing.
 */
function fakeSupabase(rpcResult: { data: unknown; error: { message: string } | null }) {
	return { rpc: vi.fn(async () => rpcResult) };
}

describe('billingGrantsReady', () => {
	it('is true when the function answers true', async () => {
		const supabase = fakeSupabase({ data: true, error: null });
		expect(await billingGrantsReady(supabase as never)).toBe(true);
	});

	it('is false when the function answers false', async () => {
		const supabase = fakeSupabase({ data: false, error: null });
		expect(await billingGrantsReady(supabase as never)).toBe(false);
	});

	it('fails closed when the function does not exist yet (migration not applied)', async () => {
		const supabase = fakeSupabase({
			data: null,
			error: { message: 'function public.billing_grants_ready() does not exist' }
		});
		expect(await billingGrantsReady(supabase as never)).toBe(false);
	});

	it('fails closed on any other RPC error', async () => {
		const supabase = fakeSupabase({ data: null, error: { message: 'connection error' } });
		expect(await billingGrantsReady(supabase as never)).toBe(false);
	});

	it('fails closed when the RPC throws', async () => {
		const supabase = { rpc: vi.fn(async () => { throw new Error('network'); }) };
		expect(await billingGrantsReady(supabase as never)).toBe(false);
	});
});
