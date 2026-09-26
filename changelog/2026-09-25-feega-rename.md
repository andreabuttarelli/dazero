# dazero renamed to feega

dazero was itself a rename from an earlier product (anomalia -> dazero, see
`src/lib/content/changelog/2026-09-21-dazero.ts`). This rename moves the product
one more time: dazero -> feega, domain dazero.co -> feega.app,
mcp.dazero.co -> mcp.feega.app, GitHub path andreabuttarelli/dazero ->
andreabuttarelli/feega.

Done in phases, each its own set of commits on
`refactor/strip-legacy-chat-and-marketing`:

- (a) packages — `@dazero/*` -> `@feega/*` in `packages/`
- (b) CLI/MCP — the `dazero` CLI binary/plugin becomes `feega`
- (c) key prefix, header, cookies/storage — `dazero_` API keys, `x-dazero-tool`
  header, persisted cookie/localStorage keys (commits d2dd13ff..49896afa)
- (d) this change — everything textual left: UI copy, i18n locale values,
  `<title>`/meta/OG tags, `app.html`, manifest, email templates, public docs
  pages, guides, `referralBadgeHtml`, README/CONTRIBUTING/AGENTS.md/CLAUDE.md/
  NEW_DATABASE_STRUCTURE.md/CONTEXT.md/`docs/**`, the GitHub repo path, and the
  `dazero.co`/`mcp.dazero.co` domains wherever still present

## What stayed `dazero`, on purpose

Every compatibility fallback from phase (c) is untouched: the `dazero_` API key
prefix is still accepted, `x-dazero-tool` is still read as the legacy tool
header, old cookie/localStorage keys still migrate on read, and the CLI still
falls back to `~/.config/dazero`. `OLD_DAZERO_*` in
`scripts/import-anomalia-talents.ts` names a real prior project, not this one.

A few identifiers turned out to be stored or externally-compared values rather
than copy, so renaming them would have been a data migration, not a textual
rename — left as `dazero` and flagged instead of guessed at:

- `src/lib/server/billing/dazero-provider.ts` — the `kind: 'dazero'`
  discriminant and the module's own filename, imported by name from
  `billing/index.ts` and its tests.
- `src/lib/server/sandbox.ts` — VM name/tag convention (`dazero-<brandId>-...`)
  and the `.dazero/` state directory inside sandbox VMs; consumed by whatever
  orchestrates those VMs outside this repo.
- `src/routes/api/v1/health/costs/tick/+server.ts` — looks up an actual brand
  row by `slug = 'dazero'` (a sentinel brand, not a name in prose).

`LESSONS.md` is untouched: its incident narratives quote literal past
container/service/repo names, including the record of the *previous*
anomalia -> dazero rename. Rewriting historical fact to match the current name
would falsify the incident record it exists to preserve.

## The CLI test-isolation bug found along the way

`cli/mcp/observability.ts`'s `getSupabaseAdmin()` cached its Supabase client by
presence alone, not by which URL/key built it. Across a `bun test` run — one
process, many files — a test that pointed the env vars at its own fake HTTP
server, or restored them after clearing `SUPABASE_SERVICE_ROLE_KEY`, left later
test files silently reusing the wrong client. Six tests in
`cli/mcp/tool-calls.test.ts` timed out or read `undefined` columns. Fixed by
keying the cache on `(url, key)` and tracking "already warned about the
missing key" as its own flag, independent of the client cache.
