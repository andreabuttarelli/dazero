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

The HTTP callers already run inside an org/brand context. Canvas generation
did not: it enhanced the prompt before entering the generation scope. The
canvas path now wraps the rewrite in `withOrgContext(input.orgId)`, so its
`prompt.enhance` row has the same payer as the render that follows it.

Behaviour of `enhancePrompt`, `checkRewrite` and the system prompt is
unchanged — only how the model call is made and logged.

Tests: `src/lib/server/prompt-enhance.test.ts` (new: asserts `llmText` is
called with `label: 'prompt.enhance'`, once per attempt, including on a
`checkRewrite` rejection — the call still happened, so it's still logged).
