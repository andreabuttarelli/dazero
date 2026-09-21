import { aiStructured, parallelVariants } from './ai-text';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

export async function bestVariant<T>(
  makePrompt: () => string,
  schema: AnyRec,
  systemInstruction: string,
  label: string,
  summarize: (v: T) => string,
  opts?: { model?: string }
): Promise<T> {
  return parallelVariants<T>(
    () => aiStructured<T>(makePrompt(), schema, systemInstruction, `return_${label}`, opts),
    async (variants) => {
      if (variants.length === 1) return variants[0];
      const list = variants.map((v, i) => `\nOPTION ${i + 1}:\n${summarize(v)}`).join('\n---');
      const prompt = `You are a content reviewer. Pick the variant most likely to be genuinely useful to the reader: factually accurate (invents nothing), directly answers the target questions, on-brand. Reject anything that reads like marketing fluff.\n${list}\nReturn JSON: { "winner": <1-based index> }`;
      const s = { type: 'object' as const, properties: { winner: { type: 'number' as const } }, required: ['winner'] };
      try {
        const raw = await aiStructured<{ winner?: number }>(prompt, s, systemInstruction, 'pick_best', opts);
        const idx = Math.max(0, Math.min(variants.length - 1, (raw?.winner ?? 1) - 1));
        return variants[idx];
      } catch {
        return variants[0];
      }
    },
    3,
    label
  );
}
