import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Ogni riga in vercel.json > crons DEVE puntare a una rotta che esiste. Prima di questo test,
// tredici righe puntavano a rotte già cancellate: Vercel le avrebbe chiamate ogni giorno e
// prese un 404 in silenzio — rumore che nasconde un guasto vero il giorno che conta.

describe('ogni cron in vercel.json punta a una rotta che esiste', () => {
	const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? []) as Array<{
		path: string;
		schedule: string;
	}>;

	it('ha trovato dei cron da controllare (il test non passa vuoto per errore)', () => {
		expect(crons.length).toBeGreaterThan(0);
	});

	it.each(crons.map((c) => c.path))('%s ha un +server.ts', (path) => {
		const file = join('src/routes', path, '+server.ts');
		expect(existsSync(file), `${path} → ${file} non esiste`).toBe(true);
	});
});
