import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = 'src/routes/api/v1';

const DECLARED_OUTLIERS: string[] = [];

const LOCAL_CRON_AUTH_PATTERNS = [/[!=]==?\s*`Bearer \$\{/, /\bsafeSecretEqual\(/];

function serverFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) serverFiles(full, out);
		else if (entry === '+server.ts') out.push(full);
	}
	return out;
}

function localAuthOutliers(): string[] {
	return serverFiles(API_ROOT).filter((file) => {
		const src = readFileSync(file, 'utf8');
		return LOCAL_CRON_AUTH_PATTERNS.some((pattern) => pattern.test(src));
	});
}

describe('le guardie cron scritte a mano restano solo negli outlier dichiarati', () => {
	it('ha trovato endpoint api/v1 da scansionare (il test non passa vuoto per errore)', () => {
		expect(serverFiles(API_ROOT).length).toBeGreaterThan(10);
	});

	it('nessun endpoint fa auth cron in casa oltre a quelli dichiarati', () => {
		const found = localAuthOutliers();
		const extra = found.filter((f) => !DECLARED_OUTLIERS.includes(f));
		const gone = DECLARED_OUTLIERS.filter((f) => !found.includes(f));

		const verdict = [
			...extra.map((f) => `${f} confronta il secret a mano: migrarlo a cronAuthorized() o dichiararlo in DECLARED_OUTLIERS`),
			...gone.map((f) => `${f} era un outlier dichiarato e non lo è più: aggiornare DECLARED_OUTLIERS`)
		].join('\n');

		expect({ extra, gone }, verdict).toEqual({ extra: [], gone: [] });
	});
});
