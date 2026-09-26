# Stop leaking a raw Response out of a form action's credit gate

`gateOrgAiAction`/`gateAiAction` (`cli-auth.ts`) return `Response | undefined` — correct for an
API route, where the handler can return that value straight through. Two form actions (canvas
`run`/`run_loop`, influencer `generate`) did exactly that: `const denied = await
gateOrgAiAction(...); if (denied) return denied;`. SvelteKit form actions can't serialize a
`Response` — it fails at runtime with "Data returned from action ... is not serializable" — so on
a zero-credit org the user saw a generic error instead of "credits exhausted", caught by
`tests/e2e/canvas.spec.ts`'s generation smoke test once `25454cd` ("gate on balance") made the
gate actually reject empty wallets instead of always passing.

## Before

- `gateOrgAiAction`/`gateAiAction`: gate the check, wrap a denial in `json(...)`. Fine for API
  routes, unusable for actions.
- Two form actions called them directly and returned the `Response`.
- One form action (`ads/library`) and one (`brands/new`) already did it right: catch
  `CreditsExhaustedError` inline, `fail(402, {...})`. No shared code, so the pattern existed twice
  and was missing twice.

## After

- `creditGateOutcome` (`cli-auth.ts`) is the one credit check both flavours wrap: it returns
  `undefined` or `{ status, data: { error, message } }` — never a `Response`.
- `gateOrgAiAction`/`gateAiAction` unchanged in shape (still return `Response | undefined`, for
  API routes).
- `gateOrgAiActionForForm`/`gateAiActionForForm` are new: same check, hand back the `{status,
  data}` shape a form action can `fail()` with directly.
- Canvas `run`/`run_loop` and influencer `generate` now call the `ForForm` variant and
  `fail(denied.status, denied.data)`.
- The canvas page's `post()` helper reads `result.data.error === 'credits_exhausted'` on a
  failed action and shows `data.message` with a "Buy credits" link to `/app/billing`, instead of
  the generic "non salvato" every other failure still gets.

## Tests

- `src/lib/server/gate-outcome.test.ts`: the new functions, both branches (allowed, denied,
  non-credits error re-thrown).
- `src/routes/p/[projectId]/c/[canvasId]/run-credits.test.ts`: the `run` action on a zero-credit
  org returns `fail(402, ...)`, never a `Response`, never calls `runGenNode`.
- `tests/e2e/canvas.spec.ts`: new spec builds a session with `withCredits: false`
  (`tests/e2e/fixtures/session.ts`) and asserts the readable message + buy-credits link show up
  in the browser. The existing generation smoke spec now grants the disposable org 5000 credits
  on setup (`E2E_ORG_CREDITS`), so it tests generation, not the empty wallet it was accidentally
  hitting.

## Not touched

`ads/library` and `brands/new`'s inline `try/catch(CreditsExhaustedError)/fail(402,...)` were
already correct — left as-is rather than forced onto the new helper for its own sake.
