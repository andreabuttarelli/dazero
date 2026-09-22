import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	BRAND_CONTEXT_TOOL_NAMES,
	brandContextPromptSection,
	createBrandContextTools
} from './brand-context-tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = {} as any;

describe('createBrandContextTools', () => {
	it('builds all four reads by default', () => {
		const tools = createBrandContextTools({ supabase, brandId: 'b1' });
		expect(Object.keys(tools).sort()).toEqual([...BRAND_CONTEXT_TOOL_NAMES].sort());
	});

	it('builds only what a caller asks for — the chat already has finer-grained brand reads', () => {
		const tools = createBrandContextTools({
			supabase,
			brandId: 'b1',
			include: ['read_market_references', 'search_web']
		});
		expect(Object.keys(tools).sort()).toEqual(['read_market_references', 'search_web']);
		expect(tools.read_brand_studio).toBeUndefined();
	});
});

describe('brandContextPromptSection', () => {
	it('names every read it built, so they are weighted and not merely available', () => {
		const block = brandContextPromptSection();
		for (const name of BRAND_CONTEXT_TOOL_NAMES) expect(block).toContain(name);
	});

	it('tells the agent not to describe a feature it has not read', () => {
		expect(brandContextPromptSection()).toContain('Never describe a feature you have not read');
	});

	it('lists only the subset, and stays empty when there is none', () => {
		const block = brandContextPromptSection(['read_knowledge']);
		expect(block).toContain('read_knowledge');
		expect(block).not.toContain('search_web');
		expect(brandContextPromptSection([])).toBe('');
	});
});

describe('the maker agents all take the bundle', () => {
	const reads = (file: string) =>
		readFileSync(new URL(file, import.meta.url), 'utf8');

	it('Motion Video spreads it once', () => {
		expect(reads('./motion-video/agent.ts')).toContain('createBrandContextTools(');
	});

	it('nobody redeclares read_brand_studio or read_knowledge by hand any more', () => {
		// Copies of these two tools with drifting descriptions is what this module replaced.
		const src = reads('./motion-video/agent.ts');
		expect(src).not.toContain('read_brand_studio: tool(');
		expect(src).not.toContain('read_knowledge: tool(');
	});

});
