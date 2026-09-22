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

describe('agent-steward e agent-tools restano moduli foglia', () => {
	it.each(['agent-steward.ts', 'agent-tools.ts', 'agent-sessions.ts'])(
		'%s non importa la chat né $lib/agent',
		(file) => {
			const src = readFileSync(join(root, `lib/server/${file}`), 'utf8');
			expect(src).not.toMatch(/from '\$lib\/server\/chat\//);
			expect(src).not.toMatch(/from '\$lib\/agent\//);
		}
	);
});
