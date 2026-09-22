# Delete the People feature, rebuild Brand settings on the real schema

`brands` was cut down (by the user) to logo, name, slug, website, short description, content —
no palette, target audience, voice, hashtags, fonts, platforms, timezone, `content_prefs`. The
People/UGC-talent feature and the old Brand settings page (`StudioPage.svelte`, ~1300 lines)
both predate that cut and never followed it: they queried `people`, `talents`, `talent_views`,
`brand_kit`, `competitors`, `brand_documents`, `social_post_history` — none of which exist in the
current schema (confirmed against `src/lib/database.types.ts`, the generated, authoritative
source; `node scripts/schema-drift-check.mjs` independently confirms every one of these columns
and tables is "assente nel database" — pre-existing drift from 147 unapplied migrations, not
introduced here).

## People / UGC-talent — deleted completely

`src/routes/p/[projectId]/settings/people/`, `src/lib/server/people.ts`, `talent.ts`,
`people-consent.ts` (+ tests), `src/lib/components/studio/` (`StudioPage.svelte`,
`FontPicker.svelte`, `sections.ts` — a concurrent agent on this branch deleted these in parallel,
same conclusion independently reached), `src/lib/studio-completeness.ts` (orphaned once the
Studio completeness pill it fed went with `StudioPage.svelte`), `src/lib/components/settings/BrandTimezone.svelte`
(edited `brands.timezone`, which does not exist), and the dead `getStudio` export in
`src/lib/server/cli-queries.ts` (zero callers — the CLI's `getStudio`/Studio surface predates the
current 12-tool MCP contract).

**Casualties fixed, not just deleted.** Several files outside the People feature itself imported
from it or queried the `people` table directly, and would not compile / would query a
nonexistent table once People was gone:

- `src/lib/server/design-visual-refs.ts` — cut down to just `fetchSocialVisualRefs` (the one
  export something outside the file still calls, `/p/[projectId]/social-thumbs/`).
  `resolvePeopleVisualRefs*`, `resolveTalentVisualRefs`, `likenessConsented`, `pushVisualRefs` had
  zero callers besides `studio-actions.ts` (now gone) and this file's own consent test (deleted).
- `src/lib/server/ads-remix.ts` — `loadRemixClientAssets` no longer queries `people`;
  `RemixClientAssets.people` / `buildRemixProduceParams`'s `models` field stay (real,
  tested output shape for the produce-params the UGC job consumes), always empty now.
- `src/lib/server/brand-design-doc.ts` — `loadDesignDoc` no longer queries `people`;
  `renderDesignDoc`'s people-rendering section stays (pure, tested, useful again once a
  replacement source exists — e.g. products/competitors already work the same way).
- `src/lib/server/knowledge.ts` — `extractEntityEdges`'s entity catalog drops the `people` query
  and the `person` mention kind; products/competitors/rubrics unaffected.
- `src/lib/server/media-generate.images.ts` — `signPaths` (generic Storage signer, was only
  housed in the deleted `people.ts`) swapped for the equivalent `signKnowledgePaths` already
  imported from `media-archive.ts` — same bucket, same shape, no new code.
- `src/lib/server/storage-refs.ts` — the `people` / `talent_views` rows removed from the storage
  garbage-collector's table registry; `storage-refs.test.ts` repointed its `jsonb_path` coverage
  onto `social_thumb_cache` (the one live table left with that form) and dropped the `people`
  area case. Note: no currently-live table exercises the `key`-based jsonb-array-of-objects sub
  case any more (`people.images[].path}` was it) — that branch of `pathsInRow` is dead code today,
  correctly reflected by the tests, not hidden.
- `src/lib/server/brand-data/write-tool.test.ts` — `deleteRow`'s file-cleanup integration tests
  used `people` as the example table; repointed onto `social_thumb_cache` for the same reason.
- `src/lib/warnings.ts` (+ test) — dropped `peopleCount` / the `studio-no-people` nudge.
- `src/lib/components/settings/platforms.ts`, `+layout.svelte` — `people` nav entry and tab title
  gone (a concurrent agent reached this file first; confirmed consistent, not re-touched).

**Explicitly NOT touched**, because they were already broken by the same schema drift and are
outside this task: `src/lib/server/cli-queries.ts`'s other exports (posts/analytics/voice/
calendar — same disease, different feature), `cli/lib/contracts/query-tables.ts` /
`write-rules.ts` (GENERATED from migration files, not the live DB — `people`/`talents` still
appear because the migrations that created them are still on disk and migrations are immutable;
regenerating would not remove them and hand-editing would just be overwritten).

## Brand settings — rebuilt on the real 6 columns

`StudioPage.svelte` rendered fields that don't exist (palette, voice, hashtags, platforms,
products/competitors/people sections, ~30 orphaned CSS selectors). Replaced with a small,
dedicated `settings/brand/+page.server.ts` + `+page.svelte`: logo (upload/remove), name, slug
(read-only), website, short description, content — one `update` action, `uploadLogo`,
`removeLogo`.

**No-brand empty state.** `settings/*` 400'd when `projects.brand_id` is null — the normal case
per `CLAUDE.md` — because the settings layout's `requireBrand()` threw unconditionally. A
concurrent agent on this branch fixed the shared layout (`settings/+layout.server.ts`) to let
only the brand route through with `brand: null`; the brand page renders a picker over the org's
other brands (`?/selectBrand`, reusing `setProjectBrand` — existed, zero callers before this) and
an inline "create a brand" form (`?/createBrand`, name → slug + org id, nothing more — there was
no brand-creation path anywhere in the app before this). Every other settings page keeps
rejecting with no brand (ads, billing, connected accounts, danger) — those don't make sense
without a real brand and weren't asked to grow an empty state.

`connected-accounts` and `danger` needed a one-line fix each (`return { brand: requireBrand(...) }`
in their own `load`) once the shared layout started typing `brand` as nullable — SvelteKit's
per-page `PageData` type only narrows on what that page's own `load` returns, not on a sibling's
runtime check.

## `settings/products` — also a casualty, kept alive on its real shape

Depended on `StudioPage.svelte` too. The old `products` schema it edited (`pricing`, `featured`,
manual CRUD) is gone; the real `products` table is sync-only (`dazero products <slug> sync`, per
`CLAUDE.md`) with different columns (`price`, `currency`, `platform`, `store_url`, `available`).
Rebuilt as a small read-only grid over the real columns — no edit/delete actions, since the old
ones edited a table that no longer exists. Redesigning the products feature is out of scope here.

## What's still broken, not fixed here

`src/lib/server/projects/brand-shell.ts` (`PROJECT_BRAND_SHELL_SELECT`) still selects `plan`,
`status`, `timezone`, `content_prefs`, `blog_config`, `ads_settings`, `zernio_profile_id` — none
of which exist. `settings/ads/*` and the billing/plan gating in the shared settings layout are
still broken by it. Confirmed pre-existing (the "Move the app onto the new schema" commit left it
this way) and out of scope for this task — the brand page bypasses it entirely with its own
direct 6-column query rather than depending on the broken shared shell.

## Verification

`npx vitest run --exclude "**/cli/**"`: 1 failing test
(`src/lib/webmcp.test.ts` — "il registry non ha piu' endpoint openWorld"), pre-existing and
unrelated (`BRAND_ENDPOINTS` in `packages/api-contracts` lost its one `openWorld` endpoint in a
prior commit on this branch, `e5c51538`/`a66e794a`/`fbb83b00`, before this task started). Canvas
suite and `dead-links.test.ts` green. `svelte-check`: no errors in any file this task touched;
remaining errors are pre-existing and unrelated (billing, calendar, share-token typing).

Not verified in a browser — no dev server was started for this task.
