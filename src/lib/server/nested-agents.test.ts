import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'src');

describe('niente agenti annidati sul GTM di produzione', () => {
	it('proposeGtmDual non chiama runGtmStrategyAgent', () => {
		const src = readFileSync(join(root, 'lib/server/gtm.ts'), 'utf8');
		expect(src).not.toContain('runGtmStrategyAgent');
		expect(src).not.toMatch(/invokeGtmStrategyAgent/);
	});
});

// CHI GUIDA IL GIRO. Il framework harness è stato rimosso: i tre batch loop guidano `generateText`
// da sé e prendono la traccia da `agent-steward`/`agent-tools`/`agent-sessions`, che sono moduli
// foglia e non toccano la chat né `$lib/agent` — questo test è ciò che impedisce a un import di
// tornare a farlo.
const loopFiles = ['produce-agent.ts', 'strategy-agent.ts', 'week-planner-agent.ts'];

describe('batch loops: cap USD restano su generateText', () => {
	it.each(loopFiles)('%s ha un tetto e non è un HarnessAgent', (file) => {
		const src = readFileSync(join(root, `lib/server/${file}`), 'utf8');
		expect(src).not.toMatch(/new HarnessAgent\b/);
		expect(src.includes('PER_RUN_USD_CAP') || src.includes('deadlineMs') || src.includes('deadlineReached')).toBe(
			true
		);
	});

	it.each(loopFiles)('%s guida l\'SDK e prende la traccia da agent-steward', (file) => {
		const src = readFileSync(join(root, `lib/server/${file}`), 'utf8');
		expect(src).toMatch(/await generateText\(/);
		expect(src).not.toContain('harnessGenerateText(');
		expect(src).not.toMatch(/from '\$lib\/server\/harness/);
		expect(src).toMatch(/from '\$lib\/server\/agent-steward'/);
		expect(src).toMatch(/from '\$lib\/server\/agent-tools'/);
	});

	it.each(['agent-steward.ts', 'agent-tools.ts', 'agent-sessions.ts'])(
		'%s non importa la chat né $lib/agent',
		(file) => {
			const src = readFileSync(join(root, `lib/server/${file}`), 'utf8');
			expect(src).not.toMatch(/from '\$lib\/server\/chat\//);
			expect(src).not.toMatch(/from '\$lib\/agent\//);
		}
	);
});

describe('week planner: HTTP resta a 200s', () => {
	it('il week planner di default ha 200s', () => {
		const src = readFileSync(join(root, 'lib/server/week-planner-agent.ts'), 'utf8');
		expect(src).toMatch(/opts\.deadlineMs \?\? 200_000/);
	});
});
