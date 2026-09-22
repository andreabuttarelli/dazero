import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/**
 * La home del progetto rimanda alla prima tela. Due cose che il redirect deve rispettare:
 *
 *   1. la destinazione è DENTRO il progetto — da /p/abc si va a /p/abc/c/xyz,
 *      non a /c/xyz, che non è la rotta di nessuno;
 *   2. senza tele si torna a /app, che è un livello sopra e ci sta.
 */
const redirect = vi.fn((status: number, location: string) => {
	const e = new Error(`redirect ${status} ${location}`) as Error & { status: number; location: string };
	e.status = status;
	e.location = location;
	throw e;
});

vi.mock('@sveltejs/kit', async (orig) => ({ ...(await orig<object>()), redirect, error: vi.fn() }));

async function loadHome(canvases: Array<{ id: string }>, projectId = 'proj1') {
	const mod = await import('./+page.server');
	try {
		await (mod.load as (e: unknown) => Promise<unknown>)({
			parent: async () => ({ project: { id: projectId }, canvases })
		});
		return { redirected: null as null | { status: number; location: string } };
	} catch (e) {
		const err = e as Error & { status?: number; location?: string };
		if (err.location) return { redirected: { status: err.status!, location: err.location } };
		return { redirected: null, thrown: err };
	}
}

describe('la home del progetto rimanda alla prima tela del progetto', () => {
	it('manda dentro il progetto, non alla radice delle tele', async () => {
		const { redirected } = await loadHome([{ id: 'c1' }]);
		expect(redirected?.location).toBe('/p/proj1/c/c1');
	});

	it('senza tele si torna a /app', async () => {
		const { redirected } = await loadHome([]);
		expect(redirected?.location).toBe('/app');
	});

	it('usa la prima tela, non una qualsiasi', async () => {
		const { redirected } = await loadHome([{ id: 'c9' }, { id: 'c2' }]);
		expect(redirected?.location).toBe('/p/proj1/c/c9');
	});
});

/**
 * Il redirect non basta a far esistere la rotta. SvelteKit costruisce il manifest
 * dai file: senza né `+page.server.ts` né `+page.svelte`, `/p/<id>` non è una rotta, e il
 * 404 nasce in `resolve()` PRIMA che un solo `load` parta — layout compreso. Un test sul solo
 * load della pagina resta verde mentre la home è irraggiungibile per tutti: è già successo.
 */
const projectRouteDir = fileURLToPath(new URL('.', import.meta.url));

function pageFilesIn(dir: string): string[] {
	return readdirSync(join(projectRouteDir, dir)).filter((f) => f === '+page.server.ts' || f === '+page.svelte');
}

describe('/p/[projectId] è una rotta, non solo un guscio', () => {
	it('ha un file di pagina, altrimenti il 404 arriva prima del layout', () => {
		expect(pageFilesIn('.')).not.toEqual([]);
	});

	it('il controllo sa dire di no: una cartella di solo endpoint non ha pagina', () => {
		expect(pageFilesIn('manual-posting/generate')).toEqual([]);
	});
});
