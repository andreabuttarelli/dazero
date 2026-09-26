# Rewrite /docs/agents and /docs/mcp for the real MCP surface

Both public docs pages documented a dead tool set (`regenerate_slide`, `generate_article`,
`publish_article`, "studio, SEO/GEO, and blog") — leftovers from before the product became an
infinite canvas of typed nodes.

Rewritten against `cli/mcp/server.ts` / `cli/mcp/tools/*.ts`, the 12 real MCP tools: `query`,
`insert_row`, `update_row`, `delete_row`, `describe_node_types`, `run_node_generation`,
`list_posts`, `create_post`, `set_post_status`, `list_ad_campaigns`, `create_ad_campaign`,
`approve_ad_campaign`. Source of truth: `cli/skills/dazero/SKILL.md` and `references/tools.md`,
rewritten against this same surface just before this task — not guessed.

Also removed the pre-existing orphaned docs i18n keys, confirmed unreferenced repo-wide before
deleting each one: `agents.s3`, `agents.s26`, `team_invites.s71` through `s74`, `credits.s34`,
`credits.s35`.

**Not touched, flagged for a follow-up:** `docs/cli` still lists `dazero plan <slug>` and
`dazero ai --message`, neither in the real CLI command set — pre-existing, outside this task's
two pages. `cli/skills/dazero/SKILL.md` has one stale example (`plan`/`status` columns) — not
fixed here since this task treated that file as the source of truth, not something to edit.

## Verification

`node -e "JSON.parse(...)"` on `src/lib/i18n/locales/docs/en.json` — valid. Checked both
`docs.agents` and `docs.mcp` i18n namespaces key-by-key: zero keys the pages reference that
aren't defined, zero defined keys the pages don't reference. Fixed one self-caught bug in the
process: `mcp.s55` was mislabeled "Generation" while displayed in the "Ad campaigns" table row.

Not verified in a browser — no dev server was started for this task.
