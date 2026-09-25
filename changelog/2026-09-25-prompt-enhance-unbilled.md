# "Migliora prompt" never wrote an ai_calls row

`src/lib/server/prompt-enhance.ts` called the AI SDK's `generateText` directly
in `runWithModel`, bypassing the shared accounting path. Every other LLM call
goes through `src/lib/server/llm.ts` (`llmText`/`llmStructured`) → `logAiCall`
(`src/lib/server/ai-log.ts`), which writes the `ai_calls` row, resolves cost
and debits `credit_ledger`. `prompt-enhance.ts` skipped that path entirely: we
paid the provider, the org was never debited, and the estimate shown by the
"Migliora prompt" switch (`enhanceUnitCredits`) never matched a real charge.

## Fix

`runWithModel` (`src/lib/server/prompt-enhance.ts:116`) now calls `llmText`
with `label: 'prompt.enhance'` instead of `generateText` directly. `llmText`
already logs the call — success or failure, accepted or rejected by
`checkRewrite` — so it's billed exactly once per rewrite attempt, same as
every other text call.

Both callers already run inside an org/brand context
(`src/routes/api/v1/prompts/enhance/+server.ts` uses `withOrgContext`,
`src/routes/api/v1/brands/[slug]/prompts/enhance/+server.ts` uses
`withBrandContext`), so no caller change was needed.

Behaviour of `enhancePrompt`, `checkRewrite` and the system prompt is
unchanged — only how the model call is made and logged.

Tests: `src/lib/server/prompt-enhance.test.ts` (new: asserts `llmText` is
called with `label: 'prompt.enhance'`, once per attempt, including on a
`checkRewrite` rejection — the call still happened, so it's still logged).
