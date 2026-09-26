import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * QUALI TABELLE SONO MARCATE MORTE, E IN CHE FORMA.
 *
 * Una tabella vuota non è una tabella morta: `webhook_deliveries` è vuota perché è una coda —
 * vuota significa «niente in attesa adesso» — e `org_usage` è vuota solo perché nessuno ha ancora
 * sfiorato il tetto dei crediti. Il criterio è un altro — esiste codice raggiungibile che ci scrive? — e la risposta,
 * una volta pagata, va scritta dove si ritrova: nel `COMMENT ON TABLE`, che `obj_description`
 * interroga e nessun grep può perdere.
 *
 * Il formato è UNO SOLO perché un commento libero non si può interrogare: chi vuole sapere quante
 * tabelle sono deprecate fa una query, non legge trentaquattro frasi diverse. Una deprecazione
 * tolta è una riga tolta da questo elenco, quindi si vede nel diff invece di accadere in silenzio.
 */
const DEPRECATED = [
	'agent_kit_approval_requests',
	'brand_design_templates',
	'brand_field_posts',
	'market_account_baselines',
	'market_account_fetch_attempts',
	'market_harvest_errors',
	'market_harvest_runs',
	'market_post_observations',
	'market_posts',
	'market_teardowns',
	'market_video_analyses',
	'brand_app_connections',
	'brand_knowledge_sources',
	'brand_triggers',
	'brand_webhooks',
	'webhook_deliveries',
	'onboarding_step_jobs'
] as const;

const MIGRATIONS = [
	'20260921180000_deprecate_dead_tables.sql',
	'20260921190000_drop_market.sql',
	'20260922200000_drop_composio_and_onboarding_steps.sql'
];

const MIGRATION = MIGRATIONS.map((name) =>
	readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')
).join('\n');

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
			expect(['2026-09-21', '2026-09-22']).toContain(date);
			expect(body.trim()).toMatch(/\.$/);
		}
	});

	/**
	 * Marcare una coda o una funzionalità mai usata da un cliente è il difetto che questo elenco
	 * previene: hanno codice vivo che ci scrive, e deprecarle mente a chi legge.
	 */
	it('non tocca le code né le funzionalità vive ma mai usate', () => {
		const marked = new Set(commented().map((c) => c.table));
		for (const alive of ['org_usage', 'ad_campaigns']) {
			expect(marked.has(alive)).toBe(false);
		}
	});
});
