import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `gateOrgAiAction`/`gateAiAction` restituiscono una `Response` — corretta per una rotta API, ma
 * una form action di SvelteKit non può restituirne una: "Data returned from action … is not
 * serializable" a runtime, e chi ha chiamato vede un errore generico invece di "crediti finiti".
 * `gateOrgAiActionForForm` è lo stesso cancello, con un esito che `fail()` sa leggere.
 */

const gateOrgCredits = vi.fn();
const gateCredits = vi.fn();

vi.mock('./credits', () => ({
	gateOrgCredits: (...a: unknown[]) => gateOrgCredits(...a),
	gateCredits: (...a: unknown[]) => gateCredits(...a),
	CreditsExhaustedError: class CreditsExhaustedError extends Error {}
}));

import { gateOrgAiActionForForm, gateAiActionForForm } from './cli-auth';
import { CreditsExhaustedError } from './credits';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('gateOrgAiActionForForm', () => {
	it('returns undefined when credits are available', async () => {
		gateOrgCredits.mockResolvedValue(undefined);

		expect(await gateOrgAiActionForForm('org-1')).toBeUndefined();
	});

	it('returns a fail()-shaped outcome, not a Response, when credits are exhausted', async () => {
		gateOrgCredits.mockRejectedValue(new CreditsExhaustedError());

		const denied = await gateOrgAiActionForForm('org-1');

		expect(denied).toBeDefined();
		expect(denied).not.toBeInstanceOf(Response);
		expect(denied?.status).toBe(402);
		expect(denied?.data).toMatchObject({ error: 'credits_exhausted' });
		expect(typeof denied?.data.message).toBe('string');
		expect(denied?.data.message.length).toBeGreaterThan(0);
	});

	it('re-throws an error that is not a credits exhaustion', async () => {
		gateOrgCredits.mockRejectedValue(new Error('db unreachable'));

		await expect(gateOrgAiActionForForm('org-1')).rejects.toThrow('db unreachable');
	});
});

describe('gateAiActionForForm', () => {
	it('returns undefined when credits are available', async () => {
		gateCredits.mockResolvedValue(undefined);

		expect(await gateAiActionForForm('brand-1')).toBeUndefined();
	});

	it('returns a fail()-shaped outcome when credits are exhausted', async () => {
		gateCredits.mockRejectedValue(new CreditsExhaustedError());

		const denied = await gateAiActionForForm('brand-1');

		expect(denied?.status).toBe(402);
		expect(denied?.data).toMatchObject({ error: 'credits_exhausted' });
	});
});
