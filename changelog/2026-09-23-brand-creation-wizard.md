# Add a brand creation wizard, and make brand markdown draggable

## Why

The only way to get a brand into an org was `/p/[projectId]/settings/brand`'s bare form: type a
name, nothing else. Everything a brand needs to start publishing — target audience, palette,
competitors, its own social handles — had nowhere to go and nothing to help fill it in, even
though the site crawler (`packages/site-analysis`, `src/lib/server/brand-analysis.ts`) already
reads all of that from a website and has since before this refactor started.

## What changed

**No schema change.** `brands` keeps exactly the columns it already has
(`logo_url`, `name`, `slug`, `website`, `short_description`, `content`). Target, palette,
competitors and social handles all go into `content` — a markdown document the wizard composes,
one `## Section` per answer (`src/lib/server/brand-wizard.ts::composeWizardContent`). A brand's
`content` is not free text a person has to remember a syntax for: it's parsed back out.

**`src/lib/canvas/brand-content-chips.ts`** is the parser and a minimal block renderer,
pure and unit-tested (`tokenizeChips`, `renderBrandContentHtml`). Two token kinds, one regex
each: `#rrggbb`/`#rgb`/`rgb(…)` for a colour, `platform:@handle` for a handle — and the
platform must be one of `SOCIAL_PLATFORMS` (`src/lib/canvas/node-data.ts`, the same table the
`social_account_feed` node's CHECK constraint already governs). A platform outside that table
stays plain text: the chip only exists where it can actually become a node. Each token renders
as a `<span class="chip …" data-drag-kind="…" data-*>`, carrying everything a drag handler needs
without a second lookup.

**Drag-payload extended, not duplicated.** `src/lib/canvas/drag-payload.ts` gets two new builders,
`colourDrag` and `handleDrag`, next to the existing `assetDrag`/`brandFieldDrag`/`influencerDrag`.
`colourDrag` produces a static `image` node — same shape as a dragged logo — and needs an asset
already materialised (`dragstart` is synchronous, it can't create one on the fly). `handleDrag`
produces a `social_account_feed` node with `platform`/`handle` already set; it's just data, no
asset needed. Both go through the exact same `CANVAS_DRAG_FILLED_NODE` → `CanvasFlow::onDrop` →
`createFilled` → the `create` action → `validateNodeData` path every other filled drag already
uses — no new client wiring, no new endpoint.

**Colour swatches are real files.** `src/lib/server/brand-colour-asset.ts` renders a
128×128 solid-colour PNG with `sharp` and uploads it to the `media` bucket (already public,
already where brand logos live) at `colours/<orgId>/<hex>.png` — idempotent by construction: the
same colour always resolves to the same path, so a second drag of `#1a2b3c` finds the existing
`assets` row via `findOrCreateImportedAsset` instead of writing a duplicate. `canvas-assets`
(private, needs a `canvasId`) was the wrong bucket here for the same reason it's wrong for a
brand logo: the brands panel and the brand item page don't know which canvas a colour will land
on.

**Products land in `products`, keyed by brand, not by node.** `NEW_DATABASE_STRUCTURE.md` already
documents `products` as `unique (brand_id, platform, external_id)` for exactly this case — one
catalogue per brand, synced once, independent of any `products` canvas node that might filter it
later. `src/lib/server/repos/products.ts::insertBrandProducts` is new; `upsertNodeProducts`
(keyed by `node_id`) is untouched, it's a different axis for a different caller. The legacy
`src/lib/server/product-catalog.ts` (`kind`/`pricing` columns) was NOT reused — it matches a
`products` shape from a migration that's flagged red by `scripts/schema-drift-check.mjs`, not
the live database.

**AI spend is gated before the site is even fetched.** `analyzeWizardSite` calls
`gateOrgCredits(orgId)` first — the org pays, since no brand exists yet — wrapped in
`withOrgContext` (`src/lib/server/ai-log.ts`) so the LLM calls attribute correctly. A
`CreditsExhaustedError` surfaces as a 402 with `error: 'credits_exhausted'`, which the wizard UI
turns into a plain message instead of a stack trace.

## The wizard itself

`src/routes/p/[projectId]/brands/new/` — one route, seven client-side steps (website → analysis
→ products → target → competitors → brand handles → overview), state kept in `sessionStorage`
so a refresh doesn't lose it. Three server actions do the actual work:
`?/analyze` (`analyzeWizardSite`), `?/syncProducts` (re-read just the catalogue, for when the
site changes mid-wizard), `?/create` (`createBrandFromWizard` — inserts the brand with a slug
that retries on collision instead of a check-then-insert race, saves the included products,
assigns the project's brand only if it doesn't have one already, matching `setProjectBrand`'s
existing semantics).

`src/routes/p/[projectId]/brands/[slug]/` is the brand item view: logo, name, description,
website, and `content` rendered with chips — every one of those five things is draggable onto a
canvas, the same `brandFieldDrag`/`colourDrag`/`handleDrag` builders the wizard's overview step
previews with.

## What this deliberately doesn't touch

`src/routes/p/[projectId]/settings/brand/` is untouched — it's the other agent's active file
(fixing a `brand: null` bug after brand creation) and the wizard doesn't need to change it to
work; the "+ New brand" link from that page's empty state is one `<a href>` for whoever lands
there next. The shell (`FloatingRail`, `CanvasLeftPanel`, `+layout.*`) is untouched; the brands
panel link and the item route are self-contained and don't require shell changes to be reachable.

## Tests

Per the "a function doesn't exist until it's wired in" rule: every server function is exercised
through its real caller, not in isolation. `src/lib/server/brand-wizard.test.ts` calls
`analyzeWizardSite`/`createBrandFromWizard` directly against `createTestSupabase`, mocking only
`runBrandAnalysis` (the site-fetch boundary) and `gateOrgCredits`.
`src/routes/p/[projectId]/brands/new/page.server.test.ts` calls the real `actions.analyze` and
`actions.create` — `listMemberships` mocked (an `orgs!inner(...)` join the fake Supabase doesn't
emulate, same precedent as `src/lib/server/tenancy/entry.test.ts`), `runBrandAnalysis` and
`safeFetchUrl` mocked (the outside HTTP), everything else — `findProjectForUser`, the brand
insert, `insertBrandProducts`, `setProjectBrand` — runs for real and is asserted on the resulting
table rows.
