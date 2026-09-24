import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `public.billing_grants_ready()` (20260924_billing_grants_ready.sql, not yet applied) is true
 * only when the Supabase Stripe Sync Engine's `stripe.checkout_sessions` table and the grant
 * trigger on it both exist. Until then a payment reaches Stripe but `credit_ledger` never sees
 * it, so every caller here — the billing page and both checkout endpoints — must refuse to sell.
 *
 * Fails closed: a missing function (migration not applied yet) and any other RPC error both read
 * as "not ready". The alternative — treating an error as ready — is a customer who pays and gets
 * nothing.
 */
export async function billingGrantsReady(supabase: SupabaseClient): Promise<boolean> {
	try {
		const { data, error } = await supabase.rpc('billing_grants_ready');
		if (error) return false;
		return data === true;
	} catch {
		return false;
	}
}
