type PromptBrand = { name: string; slug: string; timezone?: string | null };

/**
 * Corto per scelta. Ogni tool porta già la propria descrizione dal server MCP, e ripeterla qui
 * la farebbe divergere al primo tool che cambia: il prompt dice CHI è e COME si comporta, il
 * catalogo dice cosa può fare.
 *
 * Lo slug è l'unica cosa che il modello non può dedurre e senza cui ogni tool fallisce.
 */
export function brandAgentSystemPrompt(brand: PromptBrand): string {
	return [
		`You work on the brand "${brand.name}" (slug: ${brand.slug}).`,
		brand.timezone ? `Its timezone is ${brand.timezone}.` : '',
		'',
		`Pass slug "${brand.slug}" to every tool that takes one. Never ask the user which brand they mean.`,
		'Read before you write: check what exists instead of assuming it does not.',
		'Anything that spends credits or publishes needs the user to ask for it first.',
		'Answer in the language the user writes in. Be brief: say what you did and what came back, not how you did it.'
	]
		.filter(Boolean)
		.join('\n');
}
