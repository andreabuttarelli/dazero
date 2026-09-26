# Types audit — why the generated types didn't stop the wrong columns

Snapshot at 2026-09-22, branch `refactor/strip-legacy-chat-and-marketing`. Other agents are
editing `src/routes/app/**`, `src/routes/p/[projectId]/**`, `src/lib/server/ai-log.ts` and
`cli/mcp/**` concurrently — every count below will drift. Re-run the greps in "How these numbers
were produced" before trusting them for a decision.

## The question, answered

**Types were generated correctly. The client that carries them almost never is.**

`src/lib/database.types.ts` is right — it was generated from the new 26-table project
(`klnswzhhgrqvbfjzioul`) and matches it exactly (verified against `NEW_DATABASE_STRUCTURE.md`).
The problem is that `SupabaseClient<Database>` only rejects a wrong column when the **client
object** carries the `<Database>` generic. Most of the code doesn't get that client:

- `src/lib/server/supabase-admin.ts` — `createAdminClient()` — returns a **bare**
  `createClient(url, key, opts)`, no generic. **98 files, 152 call sites** import it.
- `src/lib/server/cli-auth.ts:87,114` and `src/lib/server/oauth.ts:147,156` — bare `createClient(`
  inline, same problem, 4 more sites.
- `src/lib/server/db/client.ts` — `createUserDb` / `createServiceRoleDb(use)` — the one place that
  **is** typed (`SupabaseClient<Database>`). Adopted by exactly `src/lib/server/repos/*.ts`
  (13 files) and a handful of route handlers. Everything else calls `createAdminClient()` instead,
  because it's older, shorter to type, and nothing stops it.

So `.from('brands').select('plan')` on an `admin` built by `createAdminClient()` returns `any` —
the compiler has no idea `brands` exists, let alone what columns it has. The 26 real tables and
the 99 dead ones look identical to that client. This is not a hypothetical: see "Live, today"
below — it is happening right now, on tables that are not going away.

## The size of the problem, reclassified

Previous measurement: 407 files call `.from(`, 14 import `database.types.ts`. That's the raw
symptom. Reclassifying against the 26-table schema (methodology below) on the **326 non-test
files** that call `.from('literal_name')`:

| Bucket | Files | Meaning |
|---|---|---|
| **Only new-schema tables** | 77 | Every `.from()` call names a table that exists today |
| **Only dead tables** | 105 | Every `.from()` call names a table that's gone — pure deletion, never typing |
| **Mixed** (both) | 91 | Touches a surviving table (almost always `brands`, sometimes `posts`/`products`/`social_accounts`) *and* a dead one in the same file |
| Not classified (dynamic `.from(var)`, or false positives like `Array.from`/`storage.from`) | ~53 | Needs a per-file look; sampled 20, all were noise (`Array.from`, `.storage.from('media')`) or helper functions building the table name from a variable |

**"Mixed" is the trap, not a rounding error.** These 91 files are old-product code
(`strategy-agent.ts`, `knowledge.ts`, `weekly-recap.ts`, most of `src/routes/p/[projectId]/**`
outside the canvas) that happens to still touch `brands` because `brands` is one of the 10 tables
that kept its name across the rewrite — MIGRATION_PLAN.md's own warning: *"le 10 tabelle con lo
stesso nome sono la trappola peggiore: `brands` esiste in entrambi, ma con colonne diverse — un
`select *` compila e mente."* A file in this bucket is not "half migrated" — it is old code that
happens to share one table name with the new schema, and it should be judged by the same
deletion criterion as the 105 dead-only files, not typed.

**Net: of 326 files, at most ~168 (77 + 91) touch a table worth typing at all, and most of those
91 are going away with the rest of their file, not being fixed table-by-table.** The real
remaining surface, once the old product is deleted, is closer to the 77 "only new" files plus
whatever fraction of the 91 "mixed" files survive the cut — and even the 77 are not all correctly
typed today (see below): table-name match is not proof of correctness.

The `src/lib/server/repos/**` family (13 files: `orgs`, `projects`, `canvas`, `assets`,
`publishing`, `profiles`, `invites`, `posts`, `chat`, `node-runs`, `doc-share`, `actor`,
`asset-storage`) is the only code actually wired to `Db` from `db/client.ts`. That's the complete
list of "already migrated and typed." Nothing else qualifies, including files in the "only new"
bucket that use `createAdminClient()` — see next section.

## Where the type safety leaks — concretely

**Bare/untyped Supabase clients, ranked by blast radius:**

| Constructor | File | Typed? | Importers (non-test) |
|---|---|---|---|
| `createAdminClient()` | `src/lib/server/supabase-admin.ts:8` | **No** — `createClient(url, key, opts)`, zero generic | 98 files / 152 call sites |
| inline `createClient(` | `src/lib/server/cli-auth.ts:87,114` | No | 2 sites, both auth-critical (loads brand for CLI/MCP requests) |
| inline `createClient(` | `src/lib/server/oauth.ts:147,156` | No | 2 sites |
| `createUserDb(token)` | `src/lib/server/db/client.ts:38` | **Yes** — `createClient<Database>` | `repos/**` + a few routes |
| `createServiceRoleDb(use)` | `src/lib/server/db/client.ts:57` | **Yes** — `createClient<Database>`, requires a `ServiceRoleUse` registry entry | `repos/**` + a few routes |

`createAdminClient()` alone outweighs everything else combined: it is the **service-role**
client (bypasses RLS — see MIGRATION_PLAN risk #2), used from cron ticks, agent tools, settings
actions, and now `ai-log.ts`, all getting `any` back from every `.from()` call. Fixing
`ai-log.ts`'s columns (done on this branch, see below) without fixing `createAdminClient()` fixes
one call site and leaves the other 151 exactly as exposed as before.

## The silent-failure pattern — ai-log.ts is fixed, but the *shape* of the bug is still live

**`ai-log.ts` itself, as of this snapshot, is no longer the bug described in the task.** Diffing
against `main`: on `main` it wrote `admin.from('ai_calls').insert({ label, ms, input_tokens,
context, ... })` — old-schema columns, on the bare `createAdminClient()` — exactly the described
failure. On this branch it now imports `AiCallInsert = Database['public']['Tables']['ai_calls']
['Insert']` directly from `database.types.ts` and builds a `row: AiCallInsert` by hand (mapping
`operation`, `prompt_tokens`, `latency_ms`, etc.), so a wrong field name is now a compile error at
that one assignment. **This is a local patch, not the structural fix**: it still calls
`createAdminClient()` (untyped) and only compiles correctly because the `row` object is
*separately* annotated as `AiCallInsert` — the client handing back `any` would accept anything
there just as happily. The very next person who copies this file's pattern without also copying
the manual type annotation reintroduces the exact bug.

**And the same *shape* of bug is present, today, elsewhere — not hypothetically:**

- **`src/lib/server/job-roster.ts:132-133`** — `admin.from('brands').select('plan')`. The new
  `brands` table (confirmed against `database.types.ts`) has no `plan` column — only `id, org_id,
  name, slug, website, short_description, content, palette, target, logo_url, created_at,
  updated_at`. This function (`brandPlanForGate`) is called from `brand-doctor.ts` and four live
  `tick` endpoints (`weekly-recap`, `library`, `market-references`, `analytics/review`) — not dead
  code. The Supabase query for a nonexistent column errors; the `catch` swallows it to
  `plan = 'unknown'`, cached for `OPTOUT_CACHE_TTL_MS`, and the comment on the function says the
  fail-open choice is deliberate ("fallire su un brand pagante per un errore di rete è il
  fallimento peggiore"). **The intent (fail open on real errors) is right; the mechanism (an
  untyped client hiding a genuinely wrong column) is the same hole `ai-log.ts` had.**
- **`src/lib/server/credits.ts:290-292` and `:327-329`** — `supabase.rpc('sum_org_ai_cost_usd', …)`
  / `sum_brand_ai_cost_usd`. Neither function exists in the generated types at all (grepped
  `database.types.ts` — zero hits for either name). Every call errors, is caught, logged with
  `console.warn('[credits] query failed…')`, and **returns `used: 0`** — i.e. the credit gate
  reports zero usage on a real error, which is the "fails open" side of a paid-plan gate. This is
  reachable from `gateAiAction` (per CLAUDE.md, the credits+plan gate for AI-spending endpoints).
- **`src/lib/server/stripe.ts:90`** — `createAdminClient().from('brands').update({
  stripe_customer_id: customer.id })`. `stripe_customer_id` is not a column on the new `brands`
  (confirmed above). Not wrapped in a swallow at all — a bare `await`, error discarded outright.
- **`src/routes/api/v1/weekly-recap/tick/+server.ts:196`** — selects `.in('status', […])` on
  `brands`; `status` is not a column on the new `brands` either. Logged via `console.error`, then
  returns a 500 — better than a silent swallow, but still a schema mismatch an untyped client let
  ship.
- **`src/lib/server/harness/persist.ts:107-118`** — `createAdminClient().from('agent_sessions')`,
  errors swallowed to `console.warn`, by design ("optional observability" per the comment) —
  lower stakes than the above (agent transcripts, not money), but same untyped path.

Full grep of `console.warn`/`console.error` adjacent to a Supabase `error` (`if (error) { ... }`
with no `throw`, no propagation) returned **~54 sites** across non-test files; the five above are
the ones that (a) touch a table that survives the rewrite and (b) use the untyped
`createAdminClient()`. The rest are either on dead tables (irrelevant — being deleted) or on
genuinely optional paths (cache warm, best-effort mirroring) where fail-open is the right call and
the risk is only "wrong column," not "wrong column disguised as normal operation."

## The plan

### 1. What gets deleted rather than typed

The **105 dead-only files** plus the **dead half of the 91 mixed files** — i.e., don't type
`strategy-agent.ts`, `knowledge.ts`, `weekly-recap.ts`, `blog-*.ts`, `brand-warnings.ts`,
`market-references.ts`, `content-library.ts`, `ads.ts`, `studio-actions.ts`,
`settings-actions.ts`, `internal-links.ts`, `site-pages.ts`, `referrals.ts`,
`post-verdict.ts`, `org.ts`, `org-billing.ts`, `job-roster.ts`'s dead-table half, or any
`src/routes/p/[projectId]/**` route outside the canvas surface. Fix the schema mismatch in these
**only** if the file is staying past this sprint for a reason unrelated to types (e.g. it's on the
critical path of an in-flight feature) — otherwise deleting it makes the audit finding moot for
free. This matches MIGRATION_PLAN.md's own rule: *"non si adatta il codice vecchio al nuovo
schema... si cancella il vecchio quando il suo sostituto funziona."*

Two files deserve a specific note because their names suggest new-canvas work but they're old:
`src/lib/server/canvas.ts` and `canvas-gen.ts` write `brand_canvas_items` /
`brand_canvas_edges` / `brand_canvases` — the **old** brand-scoped canvas, not the new
`canvases`/`nodes`/`nodes_connections` schema. `canvas.ts` has zero live importers outside its own
test — dead, safe to delete now. `canvas-gen.ts` is still imported by
`src/routes/p/[projectId]/workbench/+page.server.ts`, which sits next to the new
`p/[projectId]/c/[canvasId]` page (Fase 2, already built) — `workbench` is the pre-cutover page;
once the new canvas page covers its functionality, `workbench` + `canvas-gen.ts` +
`canvas.ts` delete together.

### 2. Order for the rest — smallest blast radius first, biggest leak first

1. **`src/lib/server/supabase-admin.ts`.** This is the single highest-leverage fix: it's the
   thing 98 files inherit `any` from. Two sub-options, pick one:
   - (a) make `createAdminClient()` itself typed (`createClient<Database>(...)`), so every one of
     the 98 importers gets real types with **zero call-site changes**. Fastest, but it means two
     ways to reach the DB survive (`createAdminClient` and `createServiceRoleDb`), which is exactly
     the duplication `db/client.ts`'s own module comment argues against ("UN CLIENT SOLO").
   - (b) delete `supabase-admin.ts` and repoint its 98 importers at
     `createServiceRoleDb(use)`, which forces each one to add a `ServiceRoleUse` registry entry —
     more work, but it's the mechanism `db/client.ts` was built for (RLS-bypass justified in one
     place, per CLAUDE.md's own rule about exceptions living next to the model that governs them).
   
   **Recommendation: (b), but staged.** Do (a) first as a one-line, same-day fix — it stops the
   bleeding immediately and costs nothing — then migrate call sites to `createServiceRoleDb` file
   by file as each one is touched for its own reason (an actual repo extraction, a bug fix, the
   old-product deletion). Don't do a 98-file mechanical PR only to satisfy the ratchet test below;
   let the ratchet test allow `createAdminClient` for now (grandfathered) and forbid *new* bare
   `createClient` calls, so the debt doesn't grow while it's paid down.

2. **`cli-auth.ts` and `oauth.ts`'s 4 raw `createClient(` sites.** These are small, self-contained,
   and auth-critical — type them directly (`createClient<Database>`) as a follow-up commit, not
   bundled with (1). `cli-auth.ts`'s `loadBrandForUser` is the CLI/MCP entry point CLAUDE.md
   documents by name; a wrong column there is wrong for every `anomalia` command, not just one
   feature.

3. **The five live/typed-leak sites found above** (`job-roster.ts`, `credits.ts`, `stripe.ts`,
   `weekly-recap/tick`, `harness/persist.ts`) — fix the specific wrong columns
   (`brands.plan`/`status`/`stripe_customer_id` don't exist; `sum_org_ai_cost_usd`/
   `sum_brand_ai_cost_usd` RPCs don't exist) as soon as (1a) lands, because that's the point where
   `tsc` will start reporting them. Kent Beck order applies: write the failing test first (a
   scenario or unit test that asserts `brandPlanForGate` / credits usage behaves correctly against
   the real `brands` schema), watch it fail, then fix.

4. **The 77 "only new" files.** Re-audit each for `createAdminClient()` vs `Db` — table-name
   match doesn't mean type-safe (four of them, `stripe.ts`, `job-roster.ts`, `credits.ts`,
   `cli-auth.ts`, already confirmed leaking). Convert the ones that survive the old-product
   deletion to use `repos/**` or a new repo module, in whatever order the deletion work exposes
   them — don't front-load this; let it follow the product surface, per MIGRATION_PLAN's own
   working method ("cancellare mentre si costruisce, non dopo").

### 3. What mechanism prevents this from recurring — verdicts

**On making `Db` the only way to reach the database, forbidding bare `createClient` outside it:**
Yes, as the end state, but not as a single flag-day. The realistic path is the staged approach in
step 1 above: type `createAdminClient` immediately (stops new damage), then retire it in favor of
`createServiceRoleDb(use)` as files get touched anyway. A hard "forbid everywhere, migrate
everything now" would be exactly the kind of big-bang the repo's own working method warns against
in MIGRATION_PLAN.md's risk table (risk #6, "la riscrittura si allarga all'infinito").

**On a ratchet test in the spirit of `no-app-imports.test.ts` / `no-side-doors.test.ts` /
`deprecated-tables.test.ts`:** Yes — write it now, grandfather the current 98
`createAdminClient()` importers explicitly (a named list, like `deprecated-tables.test.ts`'s
`DEPRECATED` array), and fail on:
- any **new** bare `createClient(` outside `db/client.ts` and `supabase-admin.ts` itself
  (mirrors `no-side-doors.test.ts`'s `VENDOR_SDKS` pattern — regex over source files, not an
  import-graph tool);
- any **new** file added to the `createAdminClient` grandfather list (so the leak can shrink but
  never grow — the list only loses entries as files get moved to `Db`, never gains them).

This is cheap to write (the existing three tests are the template) and it converts "98 files are
untyped" from an invisible fact into a number the test prints and a diff shows moving.

**On running `npm run db:types` in CI:** **No, not that script as-is** — the task's own rules say
not to run it here because the CLI isn't logged in, and more generally it requires a live
`supabase gen types` call against a specific project id, which means a CI secret and a network
call on every PR for a file that only needs to change when a migration lands. **Run
`node scripts/schema-drift-check.mjs` in CI instead** — it already exists, is read-only,
anon-key, zero-row, and CLAUDE.md documents it as the tool for exactly this ("says which
migrations are not applied and which names are wrong in the code"). It's not in any of the three
existing workflows (`ci.yml`, `cli-release.yml`, `release.yml`) today. Adding it to `ci.yml`
catches drift **on the PR**, which is strictly better than catching it in production, and costs
one more job step, not a new credential.

**The gap the task didn't ask about but the evidence points straight at:** CI's
`scripts/typecheck-runtime.mjs` runs `tsc --noEmit` but only fails the build on five specific
error codes (TS2304, TS18004, TS2552, TS2554, TS2555 — undefined names and arity mismatches), by
its own comment, *because* "full tsc/svelte-check still has many pre-existing type mismatches;
those must not block Vercel deploys." **A wrong property access on a typed client is TS2339 or
TS2353 ("Object literal may only specify known properties") — neither is in that whitelist.**
This means: even after every file above is converted to `Db`/`createServiceRoleDb`, a wrong
column name would show up in `tsc` output and **still not fail CI**, because the gate was built to
tolerate the old codebase's pre-existing type debt and was never narrowed back. This is the actual
mechanism gap, and it's a precondition for steps 1-2 mattering: typing the client is necessary but
not sufficient if the CI gate that's supposed to read those types is deliberately not reading them
for this error class. Recommend: once `createAdminClient`'s grandfather list in the ratchet test
above shrinks to zero (or in parallel, scoped to `src/lib/server/repos/**` and any new file), add
TS2339/TS2353 to `RUNTIME_NAME_RE` for those paths specifically — not repo-wide, which would still
break on the old product's pre-existing mismatches before it's deleted.

## How these numbers were produced (re-run to check drift)

```bash
# files calling .from(), non-test
grep -rl "\.from(" src --include="*.ts" --include="*.svelte" | grep -v ".test.ts" | wc -l   # 326

# per-file table classification (static string literals only — dynamic .from(var) not captured)
grep -rn "\.from(" src --include="*.ts" --include="*.svelte" | grep -v ".test.ts" \
  | sed -E "s/^([^:]+):[0-9]+:.*\.from\('([a-z_]+)'\).*/\1\t\2/" | grep -P '\t[a-z_]+$'
# then bucket per file against the 26-name list from database.types.ts top-level keys

# bare/untyped clients
grep -rn "= createClient(" src --include="*.ts" | grep -v ".test.ts"        # 4 sites
grep -rln "createAdminClient(" src --include="*.ts" | grep -v ".test.ts"    # 98 files
grep -rn  "createAdminClient(" src --include="*.ts" | grep -v ".test.ts" | wc -l   # 152 call sites

# repos family (the only code on Db)
ls src/lib/server/repos/*.ts | grep -v test   # 13 files, all `import type { Db } from '$lib/server/db/client'`

# new-schema table names, ground truth
grep -oE "^\s+[a-z_]+: \{" src/lib/database.types.ts | sed -E 's/^\s+([a-z_]+): \{/\1/' | sort -u
# → 26 names, matches the task's list exactly; no post_metrics/ad_metrics/influencers
#   (those are open questions in NEW_DATABASE_STRUCTURE.md, not applied)

# CI gate scope
cat scripts/typecheck-runtime.mjs   # RUNTIME_NAME_RE = /error TS(2304|18004|2552|2554|2555):/
grep -rl "db:types\|schema-drift-check" .github/workflows/   # zero hits, neither runs in CI today
```
