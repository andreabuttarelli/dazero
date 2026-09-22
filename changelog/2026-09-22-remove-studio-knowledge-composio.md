# Studio subpages, the knowledge feature and Composio go away

Three more crons + routes (Task A), the whole `p/[projectId]/studio/` subtree (Task B), the
knowledge (RAG-document) feature (Task C), and Composio in full — including outbound webhooks —
(Task D). Scope arrived after the other agent's 10-cron/autoblog pass on the same branch; see
that agent's own changelog entry for the unrelated cleanup done in parallel.

## Task A — 3 more crons

Deleted `/api/v1/knowledge/sources/work` (`0 */6 * * *`), `/api/v1/knowledge/work`
(`*/2 * * * *`) and `/api/v1/onboarding/steps/work` (`*/2 * * * *`) from `vercel.json`, plus
their route files. `onboarding/steps/work` drove the old step-by-step onboarding (website
research, staged setup); `src/routes/app/onboarding/` was already gone, this worker was its last
moving part. Deleted `src/lib/server/onboarding-steps.ts` (+ test) with it: zero other callers
(`startOnboardingStepJob`, `getOnboardingStepJob`, `latestOnboardingStepJob` were each used only
by this worker and its own test).

## Task B — `p/[projectId]/studio/` gone

Deleted the whole directory: `brand`, `platforms`, `hashtags`, `voice-examples`, `people`,
`products`, `knowledge`, `competitors`, plus its layout/index.

**What this actually was, discovered mid-task.** Six of the eight subpages (`brand`,
`platforms`, `hashtags`, `voice-examples`, `people`, `products`) were already 8-line redirect
stubs to `settings/*` — a prior commit ("Fold four settings routes into one brand settings
page") had already migrated their real UI into `settings/brand` (`StudioPage.svelte`,
`studio-actions.ts`), `settings/products`, `settings/people`. **The task's anticipated gap
("deleting studio/brand removes the only UI for editing brand identity") does not exist**:
`settings/brand` already has it — logo, colors, `about`, `target_audience`, platforms, hashtags,
voice examples, all live and unrelated to this change.

**The real, unanticipated gap: competitors.** `studio/competitors` (236 real lines, not a stub)
was the only UI to add/edit/research competitors. `settings/competitors` existed only as a
redirect *back* into `studio/competitors` ("Competitors live in the Studio") — never migrated,
and no canvas node replaces it. Deleting `studio/competitors` per instruction removes brand
competitor management from the product with nothing standing in for it. Not worked around, per
instruction — stated here.

`knowledge` (178 real lines) is superseded by canvas nodes, per the user's own framing — the one
subpage where "replaced already" is actually true.

Nav cleanup: `warnings.ts`, `chat-sources.ts`, `workbench-paths.ts` (+test),
`agent-owners.ts`, `lifecycle.ts`, `setup-checklist.ts` no longer point at `/studio*` — bare
`/studio` now resolves to `/settings/brand`, `/studio/competitors` now resolves to the brand
overview (no dedicated page to send anyone to). `settings/competitors`'s stub (which redirected
into the now-gone `studio/competitors`) is deleted outright rather than left pointing nowhere.
Removed the now-unreachable `refreshMarketReferences` form action from `studio-actions.ts` (its
only caller was `studio/competitors/+page.svelte`) — the rest of `studio-actions.ts` stays, it
backs `settings/brand`, `settings/video`, `settings/products`, `settings/people`.

## Task C — the knowledge feature, scoped down from "in full"

Deleted: knowledge management endpoints (`/api/v1/brands/:slug/knowledge`, the status/sources
one — NOT `/knowledge/search`, see below), `knowledge-sources.ts` (+test),
`knowledge-connectors/**`, `knowledge-providers.ts`, `knowledge-scope.ts`, `drive-folders.ts`
(+test), `notion-pages.ts`, `github-repos.ts` (orphaned once `brand-triggers.ts` went with
Composio), `KnowledgeConnectors.svelte`, `DriveFilePicker.svelte`.

**Deliberately NOT deleted: `src/lib/server/knowledge.ts` and `knowledge-prompt.ts`.** These
are not knowledge-*management* UI — they're the retrieval engine (`searchKnowledge`, hybrid
FTS+embedding, `selectChunksForPrompt`) wired directly into live caption generation
(`content-preview/caption-quality.ts`'s `loadCaptionKnowledge`, called from `executePlan` — the
actual weekly-plan render path), the chat agent's knowledge tool
(`strategy-agent-reads.ts`'s `readKnowledgeForAgent`, used by `strategy-agent.ts`,
`week-planner-agent.ts`, `produce-agent.ts`), `recordChunkUsedByPost` (called from
`weekly-plan/produce` and `content/create-single`), and a generic markdown converter
(`file-to-markdown.ts`, `[...path=md]` public route) that has nothing to do with knowledge
despite living in the same file. Deleting this file would have broken live post generation, not
just removed an unused management surface — "delete the knowledge feature" was read as "delete
the document-management surface", not "delete the RAG the product still runs content through".

Restored `/api/v1/brands/:slug/knowledge/search/+server.ts` after first deleting it: it's the
route behind the `search_knowledge` tool contract in `packages/api-contracts` (`SEARCH_KNOWLEDGE`),
which is live and tested (`knowledge.test.ts` asserts it's registered; `retired-tools.test.ts`
explicitly keeps `search_knowledge` on purpose: "cerca per embedding nei documenti del brand:
legge, non scrive") and reachable from three surfaces this registry drives — the CLI, the
app-embedded MCP server, and WebMCP (`src/lib/webmcp.ts`, live in the browser). Deleting it was
a mistake caught by the registry's own test before it shipped.

MCP/CLI tool retirement: `search_knowledge` and `add_note` were already in the retired-tools
registries this repo uses for that purpose (`cli/mcp/read-tools.test.ts`'s `RITIRATE`,
`packages/api-contracts/src/retired-tools.test.ts`'s `KEPT_ON_PURPOSE` for `search_knowledge`
specifically, since its route survives) — no new work needed there. Removed the orphaned
`cli/lib/contracts/knowledge.ts` (dead: zero code imported it, the `/knowledge/search` endpoint
it advertised for the standalone CLI binary had no CLI command calling it) and its four
reference points in `cli/lib/contracts/index.ts`.

## Task D — Composio, in full

Deleted: `composio.ts`, `composio-catalog.ts` (+ client-safe `composio-catalog.ts`,
`composio-catalog-cache.ts`), `composio-agent.ts` (client + server), `chat-connect.ts`,
`brand-webhooks.ts`, `brand-triggers.ts` (+ their tests), `/api/v1/composio/webhook`,
`/api/v1/brands/:slug/connections*` (all four routes), `/api/v1/webhooks/work`,
`/api/v1/brands/:slug/webhook`, `settings/connectors` (the whole page — both halves, the
KnowledgeConnectors catalog UI and the webhook-endpoint form, were Composio-only), the
`connectors` settings-nav entry and its `FEATURE_CONNECTORS` flag, `docs/api/09-connections.md`,
and the `## Connectors (Composio)` section of this file's own CLAUDE.md (explicitly authorized —
it documented now-dead architecture).

**Two checks, both came back "safe to delete":**
- `/api/v1/webhooks/work`'s delivery queue (`enqueueDelivery`) had exactly one writer:
  `/api/v1/composio/webhook`. No other enqueuer exists — deleting the drain leaves nothing
  orphaned.
- `app_integration_registry` was already dropped by migration `0193` before this task — CLAUDE.md's
  own description of it was already stale. `brand_app_connections` and `brand_knowledge_sources`
  (the real registry/mirror tables Composio used) had zero readers left once
  `composio-catalog.ts` and `knowledge-sources.ts` were gone.

Six tables (`brand_app_connections`, `brand_knowledge_sources`, `brand_triggers`,
`brand_webhooks`, `webhook_deliveries`, `onboarding_step_jobs`) are now unwritten. Marked
`COMMENT ON TABLE ... 'DEPRECATED'` in a new migration, following this repo's existing
convention (`20260921180000_deprecate_dead_tables.sql`) rather than dropping — this repo's
deploys don't run migrations, so a `drop table` here and a live table in production would be
pure, silent divergence. `deprecated-tables.test.ts` updated to know about the new migration and
its later date.
