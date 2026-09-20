/**
 * HOW MUCH ROOM EVERY AI CALL GETS TO ANSWER.
 *
 * The bug this kills is silent truncation. A model that hits its output ceiling does not fail — it
 * stops mid-sentence and returns what it had, and every caller here treats that as a result: a
 * strategy that ends halfway through phase two, an editorial plan missing its last week, a JSON
 * body that no longer parses, a chat reply cut off at the interesting part. Nothing in the logs
 * says "truncated" unless someone checks the finish reason, and most of these call sites do not.
 *
 * So every call gets the model's OWN ceiling, not a number someone guessed while writing one
 * feature. Raising it costs nothing on its own: output tokens are billed as they are generated,
 * never as they are reserved. What it buys is that the ceiling stops being the thing that decides
 * how long an answer is — the prompt is.
 *
 * PER MODEL, because "high" is a different number on each API and going over is a 400, not a
 * clamp. Every value below is the published maximum output for the model we actually route to;
 * each carries the date it was checked, because these move — the first version of this file put
 * DeepSeek at 8192, which was its V3-era limit and 47× too low for the V4 models in `deepseek.ts`.
 * When a model id changes in the file named beside a constant, re-check the number here too.
 */

/** Gemini 3.7 Flash / 3.x Pro — 64k output, 1M context. (checked 2026-08-20) */
export const GEMINI_MAX_OUTPUT_TOKENS = 65_536;

/** MiMo v2.5 and v2.5-Pro (`max_completion_tokens`) — 128k output. (checked 2026-08-20) */
export const XIAOMI_MAX_OUTPUT_TOKENS = 131_072;

/**
 * DeepSeek V4 Flash / Pro — 384k output inside a 1M context. The API clamps to whatever the
 * context leaves after the prompt rather than erroring, so the full ceiling is safe to send.
 * (checked 2026-08-20)
 */
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 384_000;

/** Claude Haiku 4.5 (citation audits) — 64k output. (checked 2026-08-20) */
export const CLAUDE_MAX_OUTPUT_TOKENS = 64_000;

/**
 * I provider dell'harness (openrouter, opencode, llm) sono uno sportello davanti a decine di
 * famiglie: il tetto lo decide il modello, non il trasporto, e chiederlo al trasporto darebbe lo
 * stesso numero a GLM e a un modello da 8k. Finche' non serve distinguerli vale un bound
 * conservativo per tutti — il rischio di sottostimare e` una risposta piu` corta, quello di
 * sovrastimare e` un 400 a meta` turno.
 *
 * 64k e` un bound SCELTO, non pubblicato: xAI non dichiara un tetto di output separato, e il
 * limite vero e` il contesto condiviso una volta che il modello si e` riservato lo spazio per
 * ragionare.
 */
export const HARNESS_MAX_OUTPUT_TOKENS = 65_536;

export type AiProviderId = 'gemini' | 'xiaomi' | 'deepseek' | 'claude' | 'openrouter' | 'opencode' | 'llm';

const BY_PROVIDER: Record<AiProviderId, number> = {
  gemini: GEMINI_MAX_OUTPUT_TOKENS,
  xiaomi: XIAOMI_MAX_OUTPUT_TOKENS,
  deepseek: DEEPSEEK_MAX_OUTPUT_TOKENS,
  claude: CLAUDE_MAX_OUTPUT_TOKENS,
  openrouter: HARNESS_MAX_OUTPUT_TOKENS,
  opencode: HARNESS_MAX_OUTPUT_TOKENS,
  llm: HARNESS_MAX_OUTPUT_TOKENS
};

/** Il tetto di output di un provider. */
export function maxOutputTokensFor(provider: AiProviderId): number {
  return BY_PROVIDER[provider];
}
