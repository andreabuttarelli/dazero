# Real-browser e2e harness, and two bugs it caught

A "make the real browser the judge" pass: `tests/e2e/fixtures/session.ts` is a Playwright fixture
that builds a disposable org/project/canvas with the service role, signs in through the real
`/login` form (not an injected cookie), and tears everything down in `finally` — Storage included,
since it isn't part of the Postgres cascade on `orgs`. Three other agents are told to build their
own specs on top of it, so it's committed early and on its own.

On top of it, two `@real` smoke specs: `canvas.spec.ts` (the canvas opens without a 500 or an
error overlay; a text node runs a real generation end to end) and `settings-brand.spec.ts` (the
no-brand empty state; creating a brand actually shows its settings afterward). Both found real
product bugs on first run — see below and the sibling public changelog entry.

## What was tried and dropped

A broader canvas suite (image-node typed ports, upload-from-bar, drag-and-drop from the assets
panel, square-corner sampling) and `assets.spec.ts` (list/filter/drag) were written and passed,
but the task's scope narrowed mid-session to "a few critical smoke specs, not every feature" —
CLAUDE.md now says a feature isn't done until it's wired UI → server → DB and proven by a test at
the right level, not that every surface needs its own e2e spec. Kept: the two paths above. Cut:
the rest, to keep the suite fast and cheap to run, not because they were wrong.

## Bug 1: brand settings silently discarded the columns it asked for

`PROJECT_BRAND_SHELL_SELECT` (`src/lib/server/projects/brand-shell.ts`) named old-schema `brands`
columns — `status`, `plan`, `timezone`, `target_platforms`, `launched_at`, `content_prefs`,
`blog_config`, `ads_settings`, `zernio_profile_id` — that don't exist on the current database
(`schema-drift-check.mjs` already lists all of them as drift). PostgREST rejected the `select`
with `42703`, `+layout.server.ts` discarded the error along with `data`, and fell back to
`brand: null` — so "Create brand" on `settings/brand` looked like it did nothing: the row was
created, `projects.brand_id` was set, and the page still showed the empty state.

Fixed the select to the real columns and reconstruct the shell with safe defaults for the missing
fields, so the ads/settings/calendar code that already reads `brand.plan` / `brand.ads_settings`
(and already tolerates `null`) keeps working unchanged — this is a query fix, not a reshaping of
what those callers expect. The layout load also now surfaces a real query error instead of
swallowing it, which is what made this take a screenshot of `__data.json` to diagnose instead of
one glance at a server log.

## Bug 2: Generate right after picking a model could silently no-op

`write()` (model/prompt changes) updates the node optimistically but only bumps the client-known
`version` once the server responds. `run()` (the Generate click) read that version separately —
picking a model and clicking Generate immediately after, with no human pause between the two
gestures, could read the pre-write version and send a `run` that the server correctly rejected as
a version conflict. The client swallowed that 409 into a generic "non salvato" banner and reset
the node to ready, with no generation ever started and no clear signal why.

Fixed by routing `run()` through the same per-node write queue `write()` already uses
(`src/routes/p/[projectId]/c/[canvasId]/+page.svelte`), so Generate waits for any in-flight write
on that node before reading its version. `canvas.spec.ts`'s text-generation spec is the test that
caught it — it drives the UI exactly as fast as the flow allows, which a human rarely does but
automation always will.
