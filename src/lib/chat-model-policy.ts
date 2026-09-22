import { z } from 'zod';
import { isGatewayModelTier, type ChatTier } from '$lib/chat-tiers';
import { MODEL_FAMILY_IDS } from '$lib/models/families';
import {
	coerceThinking,
	familyForTier,
	modelFamily,
	type ModelFamilyId,
	type ThinkingLevel
} from '$lib/models/catalog';

/**
 * La riga salvata su `chat_threads.model` — non un id wire grezzo, ma una famiglia del catalogo
 * piu` la scala di ragionamento. `model` porta l'id del gateway quando l'utente ne ha scelto uno
 * dal catalogo invece di un preset: `family` resta a dire quali gradini offrire, e le righe
 * salvate prima che il campo esistesse continuano a valere.
 */
const AgentModelPolicy = z.object({
	family: z.enum(MODEL_FAMILY_IDS),
	thinking: z.enum(['off', 'low', 'medium', 'high', 'max']).default('medium'),
	model: z.string().min(1).max(120).optional()
});

type ModelPreference = z.infer<typeof AgentModelPolicy>;

export function turnModelFamily(
	threadModel?: unknown,
	customAgentModel?: unknown
): ModelPreference | null {
	const fromThread = parseModelPolicy(threadModel);
	if (fromThread) return fromThread;
	return parseModelPolicy(customAgentModel);
}

/**
 * La scelta del picker diventa la riga da salvare su chat_threads.model. Nessuna scelta = null:
 * il thread torna al default del catalogo invece di restare incollato all'ultimo modello scelto.
 */
export function policyForChoice(tier: ChatTier | null, thinking: unknown): ModelPreference | null {
	if (!tier) return null;
	const family = familyForTier(tier);
	const policy: ModelPreference = { family: family.id, thinking: coerceThinking(thinking, family) };
	return isGatewayModelTier(tier) ? { ...policy, model: tier } : policy;
}

/**
 * Il tier che nel picker rappresenta ogni famiglia. Luna e Grok non ce l'hanno piu`: erano i
 * preset Fast e Pro, e una preferenza salvata che nomina solo la famiglia non sa piu` dire QUALE
 * modello — quindi non si ripristina, e la chat riparte dal default.
 */
const TIER_BY_FAMILY: Partial<Record<ModelFamilyId, ChatTier>> = {
	'deepseek-pro': 'deepseek-pro',
	'gpt-terra': 'gpt-terra',
	'gpt-sol': 'gpt-sol'
};

function parseModelPolicy(raw: unknown): ModelPreference | null {
	const parsed = AgentModelPolicy.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

export function choiceForPolicy(raw: unknown): { tier: ChatTier; reasoning: ThinkingLevel } | null {
	const policy = parseModelPolicy(raw);
	if (!policy) return null;
	// Un id del catalogo vince sulla famiglia: la famiglia lì dentro dice solo la scala.
	const tier = policy.model ?? TIER_BY_FAMILY[policy.family];
	if (!tier) return null;
	return { tier, reasoning: coerceThinking(policy.thinking, modelFamily(policy.family)) };
}
