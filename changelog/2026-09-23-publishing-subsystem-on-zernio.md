# The publishing subsystem, rebuilt on the current schema, Zernio as the only source of truth

## Deleted (18628294, bf0ece5f)

`posts.platform`, `media_url`, `slot`, `content_type`, `format`, `platforms`, `scheduled_for` —
the old migrations that created them were never applied to the new canvas database
(`schema-drift-check.mjs`, 42703). `publish.ts`, `manual-posting.ts`, `post-editing.ts`,
`platform-limits.ts`, `prepublish-check.ts`, the calendar and manual-posting routes, the old
`brands/[slug]/posts` REST tree, the `posts/prepublish/tick` cron, and the CLI
commands/contracts wired to them were dead code — this repo's deploys don't run migrations, so
none of it had worked since the schema moved. `post-verdict.ts` went with it (orphaned once
`publish.ts`/`post-editing.ts` were gone), and so did the old chat's `post-tools.ts` contract
(`approve_post`/`reject_post`/`reschedule_post`/`cross_post`/`update_post`) — the chat that used
it is already gone on this branch.

Kept: `cli-queries.ts::getCalendar`/`getBrandsList`/`getBrandDetail` — they back
`shared-views.ts` (public `/share/<token>` links) and the brand list/dashboard, separate live
features reading the same old `posts` columns. Deleting those is a separate task; flagged, not
touched.

## Platform capability table (118cb6f0)

A post is caption + ordered media. The format on each platform is DERIVED, never chosen: one
image → image post; several → a carousel where the platform renders one
(instagram/facebook/linkedin) or a multi-image post on X (max 4); one video → video/reel; a
mix of image+video, or more images than a platform can carry, is refused with a reason — never
truncated or dropped. `formatFor(platform, media[])` (`src/lib/platform-capabilities.ts`) is the
one place this logic lives; composer, delivery and MCP all read the same table instead of
scattering `if (platform === …)`.

## Zernio is the only source of truth (user decision, 2026-09-22)

No local copy of schedule time or delivery status — every "is it out? when? with what error?"
question goes to Zernio, every time. `posts.zernio_post_ids` (migration written, not applied:
`supabase/canvas-migrations/20260922_drop_scheduled_posts.sql`) is a pointer only — a map of
`social_accounts.id` to the Zernio post id for that account, since `SocialPublisher.publish()` is
one HTTP call per (account, platform) and returns one id. `scheduled_posts` (0 rows, no writer)
is dropped by the same migration, along with `ad_creatives.scheduled_post_id` — the boost of an
organic post now points at `post_id` directly.

`repos/post-delivery.ts`: `scheduleDelivery` (one `publish()` per account, gated by
`formatFor`), `deliveryStatus` (asks Zernio per account; an unreachable Zernio is its own
per-account status, never a thrown error that blanks the calendar), `cancelDelivery`
(`deletePost` on Zernio BEFORE touching the pointer — a failed cancel must never drop the only
record of a live schedule).

## The calendar (`p/[projectId]/calendar/`)

Reads the project's brand (resolved directly against the real `brands` columns — see the
`brand-shell.ts` finding below, not this route's problem to fix), that brand's `social_accounts`
and `posts`, and asks Zernio for each post's delivery status live. No brand → an empty state
pointing at Settings → Brand, not a 400. Actions (`schedule`, `publishNow`, `cancel`,
`reschedule`) resolve `org_id` server-side from the project in the URL, never trust the form.

Proven wired, not just written (calendar.actions.test.ts): the real `actions.schedule` calls the
real `scheduleDelivery`, which calls a mocked `SocialPublisher.publish` — same trace for
cancel/reschedule. A client-side bug in the account-picker checkbox (native toggle works, the
Svelte change handler never fires — not resolved after 8 debug rounds with server stack traces)
blocks a browser smoke test of the click path; the action tests are unaffected since they call
the server functions directly, bypassing the browser entirely.

## Node → post (`repos/post-from-nodes.ts`)

Given canvas node ids, resolves each to its asset (`data.assetId` for an upload, `data.
output_asset_id` for a generation — only once `data.status === 'done'`), orders media by
reading order (top-to-bottom, then left-to-right), takes the caption from text/doc nodes, and
calls `promoteToPost` with `post_sources`. Wired through `/api/v1/org/posts` POST (`node_ids`
alongside the existing `caption`/`media` path) and MCP `create_post`.

## A repo-wide bug found along the way, not fixed here

`src/lib/server/projects/brand-shell.ts` selected `status`/`plan`/`target_platforms`/
`content_prefs`/`blog_config`/`ads_settings`/`zernio_profile_id` — none of which exist on the
current `brands` table. Every read 42703'd, the Supabase client doesn't throw, and the caller
only destructured `{data}` — so `parent().brand` was silently `null` on every project that had
one. Fixed by someone else mid-session (`projectBrandShellOf`, safe defaults); dozens of other
files (ads, billing, settings, connections) still read those same phantom columns — out of scope
here.
