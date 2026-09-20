import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MAX_OUTPUT_TOKENS,
  DEEPSEEK_MAX_OUTPUT_TOKENS,
  GEMINI_MAX_OUTPUT_TOKENS,
  HARNESS_MAX_OUTPUT_TOKENS,
  XIAOMI_MAX_OUTPUT_TOKENS,
  maxOutputTokensFor,
  type AiProviderId
} from './ai-output-limits';

const PROVIDERS: AiProviderId[] = ['gemini', 'xiaomi', 'deepseek', 'claude'];

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
    expect(XIAOMI_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(131_072); // MiMo v2.5 Pro
    expect(DEEPSEEK_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(384_000); // DeepSeek V4
    expect(CLAUDE_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(64_000); // Haiku 4.5
    // L'harness non ha un tetto pubblicato: il bound è nostro, e deve restare dentro l'intervallo
    // realistico per una chiamata sola invece di scivolare su tutta la finestra di contesto.
    expect(HARNESS_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(65_536);
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

  it('ignores modelId for providers that serve one family', () => {
    expect(maxOutputTokensFor('gemini', 'gpt-5-6-sol')).toBe(GEMINI_MAX_OUTPUT_TOKENS);
  });
});
