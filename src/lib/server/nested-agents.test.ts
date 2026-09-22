import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'src');

describe('agent-steward e agent-tools restano moduli foglia', () => {
	it.each(['agent-steward.ts', 'agent-tools.ts'])(
		'%s non importa la chat né $lib/agent',
		(file) => {
			const src = readFileSync(join(root, `lib/server/${file}`), 'utf8');
			expect(src).not.toMatch(/from '\$lib\/server\/chat\//);
			expect(src).not.toMatch(/from '\$lib\/agent\//);
		}
	);
});
