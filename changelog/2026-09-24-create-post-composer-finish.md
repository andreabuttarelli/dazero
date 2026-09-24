# The post composer looked unfinished: bare-text controls, no brand path, two type errors

`create-post/+page.svelte` filled in correctly (media thumbnail, caption from the
text node) but the chrome around it didn't match the rest of the app.

## Real controls instead of bare text

"Up Down Remove" and "Save as draft Approve and schedule" were plain `<button>`
tags with no styling — readable as text, not as controls. Media reordering now
uses square icon buttons (`@lucide/svelte` arrow-up/arrow-down/trash-2, 26px,
`title`/`aria-label` for the tooltip), and the footer uses the same `.btn` /
`.btn.primary` / `.btn.ghost` pattern already used by `settings/brand/+page.svelte`
— the sibling sheet's convention, not the unused shadcn `$lib/components/ui/button`
(grepped: zero imports of it anywhere under `p/[projectId]`).

## Language: English, matching sibling sheets

Checked how calendar and settings/brand get their strings first: no `svelte-i18n`,
plain hardcoded English (`This project has no brand yet.`, `Go to Brand settings`).
The composer already followed that convention (`create-post-errors.ts` is Italian
copy for API error codes, an existing inconsistency out of scope here) — kept it in
English rather than switching to Italian, since the two nearest sibling sheets both
use English and neither reads from `en.json`.

## No brand: a way forward, not a dead end

The empty-brand state now links to `/p/[projectId]/brands/new` (the existing
brand-creation wizard, already the target link from `settings/brand`) instead of
a flat "No brand available." There's no `returnTo` support in `sheet-nav.ts` — the
wizard is a real page, not a sheet — so it opens as a normal navigation; wiring a
return path back into the composer is future work if needed.

## Disabled reasons, not just disabled buttons

`saveReasonFor`/`scheduleReasonFor` in `create-post-composer.ts` are a small ordered
table (no brand → no content → [schedule only] no connected accounts) instead of
scattered conditions in the template. Each footer button shows its blocking reason
inline when disabled.

## The two type errors

`form && 'error' in form` — SvelteKit's `ActionData` can be `{}` in a branch the
`in` operator can't be used on for a possibly-primitive type. Added a
`typeof form === 'object'` guard before both `in` checks.

## Test

`create-post-composer.test.ts` — `saveReasonFor`/`scheduleReasonFor` against the
four `ComposerReadiness` combinations that matter (brand missing, content missing,
accounts missing, all ready). Verified in the browser with a throwaway Playwright
script (login → select two nodes → open composer → screenshot): icon buttons
render, footer buttons render as real controls with reasons, brand CTA links to
the wizard route.
