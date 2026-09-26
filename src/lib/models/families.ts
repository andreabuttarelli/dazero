/**
 * Il vocabolario delle famiglie di modelli: la lista, e nient'altro.
 *
 * Sta in un file suo e senza import perché i due che lo leggono si leggono già fra loro —
 * `chat-tiers.ts` importa `catalog.ts` e `catalog.ts` importa `chat-tiers.ts`. Metterlo in uno dei
 * due chiuderebbe il ciclo.
 */
export const MODEL_FAMILY_IDS = ['luna', 'grok', 'gemini-flash', 'deepseek-pro', 'gpt-terra', 'gpt-sol'] as const;

export type ModelFamilyId = (typeof MODEL_FAMILY_IDS)[number];
