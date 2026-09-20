import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MAX_OUTPUT_TOKENS,
  DEEPSEEK_MAX_OUTPUT_TOKENS,
  GEMINI_MAX_OUTPUT_TOKENS,
  HARNESS_MAX_OUTPUT_TOKENS,
  KIE_GPT_MAX_OUTPUT_TOKENS,
  KIE_GROK_MAX_OUTPUT_TOKENS,
  XIAOMI_MAX_OUTPUT_TOKENS,
  maxOutputTokensFor,
  type AiProviderId
} from './ai-output-limits';

const PROVIDERS: AiProviderId[] = ['gemini', 'kie', 'xiaomi', 'deepseek', 'claude'];

describe('ai output limits', () => {
  it('gives every provider a ceiling — a missing one silently means "provider default"', () => {
    for (const p of PROVIDERS) {
      expect(maxOutputTokensFor(p), p).toBeGreaterThan(0);
    }
  });

  it('keeps every ceiling far above the values that were truncating answers', () => {
    // What these replaced: kie Claude's hardcoded 2048, the web-search chain's 2500, MiMo's 8192
    // text path, DeepSeek's own default, and no ceiling at all on Gemini and the kie Responses API.
    for (const p of PROVIDERS) {
      expect(maxOutputTokensFor(p), p).toBeGreaterThanOrEqual(64_000);
    }
  });

  it('does not exceed each model published maximum — over it is a 400, not a clamp', () => {
    expect(GEMINI_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(65_536); // Gemini 3.7 Flash
    expect(KIE_GPT_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(128_000); // GPT 5.6 Terra / Sol
    expect(XIAOMI_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(131_072); // MiMo v2.5 Pro
    expect(DEEPSEEK_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(384_000); // DeepSeek V4
    expect(CLAUDE_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(64_000); // Haiku 4.5
    // Grok publishes no output cap; the bound is ours, so it must stay inside the range xAI
    // describes as realistic for one call rather than drift up to the context window.
    expect(KIE_GROK_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(65_536);
  });

  /**
   * IL TETTO DELL'HARNESS VALE 65.536, E NON SI MUOVE DA SOLO.
   *
   * Oggi prende il valore in prestito da una costante di kie. Kie se ne va, e il numero deve
   * restare: e` il tetto di OGNI strada viva — openrouter, opencode, llm. Sotto, le risposte si
   * troncano a meta`; sopra, e` un 400 a turno iniziato. Nessuno dei due si vede in una suite
   * verde, e nessuno dei due si nota finche` non e` in produzione.
   */
  it('il tetto dell’harness resta 65.536 anche quando kie non c’e’ piu’', () => {
    expect(HARNESS_MAX_OUTPUT_TOKENS).toBe(65_536);
    for (const p of ['openrouter', 'opencode', 'llm'] as AiProviderId[]) {
      expect(maxOutputTokensFor(p), p).toBe(65_536);
    }
  });

  it('splits kie by model family — one provider, three ceilings that differ 2x', () => {
    expect(maxOutputTokensFor('kie', 'gpt-5-6-terra')).toBe(KIE_GPT_MAX_OUTPUT_TOKENS);
    expect(maxOutputTokensFor('kie', 'claude-haiku-4-5')).toBe(CLAUDE_MAX_OUTPUT_TOKENS);
    expect(maxOutputTokensFor('kie', 'grok-4-6')).toBe(KIE_GROK_MAX_OUTPUT_TOKENS);
    // Unknown or absent model id falls back to the safe bound, never the widest one.
    expect(maxOutputTokensFor('kie')).toBe(KIE_GROK_MAX_OUTPUT_TOKENS);
    expect(maxOutputTokensFor('kie', 'something-new')).toBe(KIE_GROK_MAX_OUTPUT_TOKENS);
  });

  it('ignores modelId for providers that serve one family', () => {
    expect(maxOutputTokensFor('gemini', 'gpt-5-6-sol')).toBe(GEMINI_MAX_OUTPUT_TOKENS);
  });
});
