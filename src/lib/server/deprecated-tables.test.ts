import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * QUALI TABELLE SONO MARCATE MORTE, E IN CHE FORMA.
 *
 * Una tabella vuota non è una tabella morta: `radar_jobs` ha 530 inserimenti storici e zero righe
 * perché è una coda, e `org_usage` è vuota solo perché nessuno ha ancora sfiorato il tetto dei
 * crediti. Il criterio è un altro — esiste codice raggiungibile che ci scrive? — e la risposta,
 * una volta pagata, va scritta dove si ritrova: nel `COMMENT ON TABLE`, che `obj_description`
 * interroga e nessun grep può perdere.
 *
 * Il formato è UNO SOLO perché un commento libero non si può interrogare: chi vuole sapere quante
 * tabelle sono deprecate fa una query, non legge trentaquattro frasi diverse. Una deprecazione
 * tolta è una riga tolta da questo elenco, quindi si vede nel diff invece di accadere in silenzio.
 */
const DEPRECATED = ['agent_kit_approval_requests', 'brand_design_templates'] as const;

const MIGRATION = readFileSync(
	new URL('../../../supabase/migrations/20260921180000_deprecate_dead_tables.sql', import.meta.url),
	'utf8'
);

/** `DEPRECATED <YYYY-MM-DD>: <perché>. <cosa usare al suo posto>.` — vedi la testa della migrazione. */
const COMMENT = /comment on table public\.([a-z_]+) is\s*\n?\s*'DEPRECATED (\d{4}-\d{2}-\d{2}): ([^']+)';/g;

function commented() {
	return [...MIGRATION.matchAll(COMMENT)].map(([, table, date, body]) => ({ table, date, body }));
}

describe('deprecated tables', () => {
	it('marca esattamente le tabelle su cui la prova c’è', () => {
		expect(commented().map((c) => c.table).sort()).toEqual([...DEPRECATED].sort());
	});

	it('usa un formato solo, o il commento non si può interrogare', () => {
		for (const { date, body } of commented()) {
			expect(date).toBe('2026-09-21');
			expect(body.trim()).toMatch(/\.$/);
		}
	});

	/**
	 * Marcare una coda o una funzionalità mai usata da un cliente è il difetto che questo elenco
	 * previene: entrambe hanno codice vivo che ci scrive, e deprecarle mente a chi legge.
	 */
	it('non tocca le code né le funzionalità vive ma mai usate', () => {
		const marked = new Set(commented().map((c) => c.table));
		for (const alive of ['radar_jobs', 'radar_feed_cache', 'webhook_deliveries', 'org_usage', 'ad_campaigns', 'brand_webhooks']) {
			expect(marked.has(alive)).toBe(false);
		}
	});
});
