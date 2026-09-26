import { describe, expect, it } from 'vitest';
import { billedCreditsFor } from './credit-ladder';
import { sandboxCredits, sandboxUsdPerSecond, withSandboxBilling } from './sandbox-credits';

describe('sandboxCredits', () => {
	it('non arrotonda mai a zero quando la macchina è stata accesa', () => {
		// Un addebito che arrotonda a zero è un addebito che non esiste: mille render brevi
		// diventerebbero mille render gratis.
		expect(sandboxCredits(0.5)).toBeGreaterThanOrEqual(1);
		expect(sandboxCredits(1)).toBeGreaterThanOrEqual(1);
	});

	it('zero secondi resta zero: non si addebita una VM mai aperta', () => {
		expect(sandboxCredits(0)).toBe(0);
		expect(sandboxCredits(-5)).toBe(0);
		expect(sandboxCredits(NaN)).toBe(0);
	});

	it('cresce col tempo — un render lungo costa più di uno corto', () => {
		// Il motivo per cui si misura a secondi e non a video: un prezzo fisso o regala i lunghi
		// o rapina i corti.
		expect(sandboxCredits(600)).toBeGreaterThan(sandboxCredits(60));
		expect(sandboxCredits(60)).toBeGreaterThanOrEqual(sandboxCredits(6));
	});

	it('billa allo stesso cambio di ogni altra chiamata AI (billedCreditsFor)', () => {
		const seconds = 3600;
		const atteso = billedCreditsFor(seconds * sandboxUsdPerSecond());
		expect(sandboxCredits(seconds)).toBe(atteso);
	});

	it('un render tipico di un minuto costa una cifra sensata, non due ordini di grandezza', () => {
		// Guardia di sanità sul listino: se qualcuno sbaglia SANDBOX_USD_PER_SECOND di 1000x,
		// questo test cade prima della bolletta.
		const perMinuto = sandboxCredits(60);
		expect(perMinuto).toBeGreaterThan(0);
		expect(perMinuto).toBeLessThan(100);
	});
});

describe('withSandboxBilling', () => {
	it('restituisce il risultato quando va bene', async () => {
		await expect(
			withSandboxBilling({ brandId: 'b1', use: 'motion_render' }, async () => 'fatto')
		).resolves.toBe('fatto');
	});

	it('lascia passare l’errore invece di inghiottirlo', async () => {
		// L'addebito non deve trasformare un render fallito in un render riuscito e vuoto.
		await expect(
			withSandboxBilling({ brandId: 'b1', use: 'motion_render' }, async () => {
				throw new Error('render esploso');
			})
		).rejects.toThrow('render esploso');
	});

});
