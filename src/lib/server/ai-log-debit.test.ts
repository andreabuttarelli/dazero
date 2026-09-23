import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `logAiCall` scriveva `ai_calls.cost_usd` e non toccava mai `credit_ledger`: un'org che aveva
 * COMPRATO crediti restava misurata contro `ai_calls` sommato, mai contro il saldo che aveva
 * pagato — un debito mai scritto, quindi un consumo mai visto dal saldo. Qui si prova che un
 * insert riuscito e prezzato scrive ANCHE un debito, agganciato alla riga con `ai_call_id`.
 */

const aiCallsRows: Record<string, unknown>[] = [];
const ledgerRows: Record<string, unknown>[] = [];

vi.mock('./supabase-admin', () => ({
	createAdminClient: () => ({
		from: (table: string) => {
			if (table === 'ai_calls') {
				return {
					insert: (row: Record<string, unknown>) => ({
						select: () => ({
							single: async () => {
								const id = `call-${aiCallsRows.length + 1}`;
								aiCallsRows.push({ ...row, id });
								return { data: { id }, error: null };
							}
						})
					})
				};
			}
			if (table === 'credit_ledger') {
				return {
					insert: async (row: Record<string, unknown>) => {
						ledgerRows.push(row);
						return { error: null };
					}
				};
			}
			throw new Error(`unexpected table ${table}`);
		}
	})
}));

import { logAiCall, withBrandContext } from './ai-log';
import { GEMINI_FLASH } from './google-models';

async function settled(): Promise<void> {
	await vi.waitFor(() => expect(aiCallsRows.length).toBeGreaterThan(0));
	await vi.waitFor(() => expect(ledgerRows.length).toBeGreaterThan(0));
}

beforeEach(() => {
	aiCallsRows.length = 0;
	ledgerRows.length = 0;
});

describe('logAiCall debita credit_ledger per una chiamata prezzata', () => {
	it('scrive un debit agganciato con ai_call_id, sull\'org della riga', async () => {
		withBrandContext('brand-1', () => {
			logAiCall({
				label: 'renderImage',
				provider: 'llm',
				model: GEMINI_FLASH,
				ms: 842,
				ok: true,
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
				orgId: 'org-1'
			});
		});

		await settled();

		expect(ledgerRows).toHaveLength(1);
		const debit = ledgerRows[0];
		expect(debit.org_id).toBe('org-1');
		expect(debit.kind).toBe('debit');
		expect(debit.source).toBe('ai_usage');
		expect(debit.ai_call_id).toBe(aiCallsRows[0].id);
		expect(debit.amount).toBeGreaterThan(0);
	});

	it('non debita una riga senza prezzo (cost_usd null)', async () => {
		withBrandContext('brand-1', () => {
			logAiCall({ label: 'internal_event', provider: 'internal', ms: 1, ok: true, orgId: 'org-1' });
		});

		await vi.waitFor(() => expect(aiCallsRows.length).toBeGreaterThan(0));
		expect(ledgerRows).toHaveLength(0);
	});

	it('non debita una chiamata fallita', async () => {
		withBrandContext('brand-1', () => {
			logAiCall({ label: 'chat', provider: 'llm', ms: 5, ok: false, error: 'boom', orgId: 'org-1' });
		});

		await vi.waitFor(() => expect(aiCallsRows.length).toBeGreaterThan(0));
		expect(ledgerRows).toHaveLength(0);
	});
});
