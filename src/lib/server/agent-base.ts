/**
 * La base comune delle superfici che PRODUCONO e poi tacciono (Motion, UGC, Media generator):
 * il contratto di `finish` e il blocco di prompt che nessuna delle tre puo` non avere.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatModelResolved } from '$lib/server/ai-model';

export const GROUNDING_BLOCK = `GROUNDING — NEVER INVENT. LOOK IT UP:
- Anything about this brand that you state, write on screen, or put in a video is either something you READ with a tool this turn, or something the user told you. There is no third source. Not the product names, not what it does, not the pricing, not a statistic, not a customer name, not a claim, not a URL.
- Before producing anything, gather the materials: read_brand_kit for palette hexes, fonts, logo and tone; read_products for what actually exists and what it is called; search_knowledge / read_documents for what has been written before; read_posts for how this brand already speaks. Then whatever else the job touches — competitors, people, the site, past results.
- SEARCHING TOO MUCH IS BETTER THAN NOT SEARCHING. A read you did not need costs a few seconds. A detail you invented is published under the user's name, and it makes every true thing next to it look invented too. When you catch yourself about to write something you have not verified, that is the moment to call a read tool instead.
- Do not settle for the first hit either: if what you read is thin, ambiguous or contradicts something else, read more before deciding. "The tool returned nothing" is a finding you report, not a blank you fill in yourself.
- The brand's own marks are never approximated: exact palette hexes, the exact font families, the real logo file, the name spelled the way the brand spells it. A colour "close enough" and a name with the wrong capitalisation are the two things a client notices first.
- If something genuinely cannot be established, say so plainly and leave the gap visible — a declared hole is recoverable, a plausible invention is not, because nobody goes looking for it.
`;

export type AgentBaseOpts = {
	supabase?: SupabaseClient;
	brandId?: string;
	userId?: string;
	threadId?: string;
	model: ChatModelResolved;
	defaultAgent: string | null;
	surfaceWriteKeys: string[];
	remainingMs?: () => number;
	locale?: string;
	sandbox?: boolean;
	requireReview?: boolean;
	label?: string;
};

/** Il rifiuto che `finish` deve restituire tale e quale al modello. */
export type FinishRefusal = { error: string; hint: string } & Record<string, unknown>;

export type AgentBase = {
	attach<T extends Record<string, unknown>>(surfaceTools: T): T;
	promptBlock: string;
	guardFinish: () => Promise<FinishRefusal | null>;
	close: () => Promise<void>;
	reviewRuns: () => number;
	reviewSkipped: () => boolean;
};

export async function createAgentBase(_opts: AgentBaseOpts): Promise<AgentBase> {
	return {
		attach: (surfaceTools) => surfaceTools,
		promptBlock: `${GROUNDING_BLOCK}\n`,
		guardFinish: async () => null,
		close: async () => undefined,
		reviewRuns: () => 0,
		reviewSkipped: () => false
	};
}
