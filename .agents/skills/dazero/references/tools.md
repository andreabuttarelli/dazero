# dazero MCP tools ↔ CLI

All tools take a brand `slug` when brand-scoped. Ids accept short unambiguous prefixes.

## Auth

| MCP | CLI |
|-----|-----|
| `login` | `dazero login` |
| `logout` | `dazero logout` |
| `whoami` | (session file / brands imply identity) |
| `list_brands` | `dazero brands` |

## Brand & posts

| MCP | CLI |
|-----|-----|
| `get_dashboard` | `dazero dashboard <slug>` |
| `get_status` | `dazero status <slug>` |
| `get_analytics` | `dazero analytics <slug>` |
| `get_calendar` | `dazero calendar <slug> [--month YYYY-MM]` |
| `get_gtm` | `dazero gtm <slug>` |
| `get_voice` / `update_voice` | `dazero voice <slug>` |
| `list_posts` | `dazero content <slug> [--status …]` |
| `approve_posts` | `dazero approve <slug> --all` |
| `get_post` | `dazero post <slug> <id>` |
| `edit_post` | `dazero post <slug> <id> edit …` |
| `approve_post` / `publish_post` / `reject_post` | `dazero post <slug> <id> approve\|publish\|reject` |
| `reschedule_post` | `dazero post <slug> <id> reschedule --scheduledFor …` |
| `render_post` | `dazero post <slug> <id> render` |
| `regenerate_post_media` | `dazero post <slug> <id> regenerate --instruction "…"` |
| `regenerate_slide` | `dazero post <slug> <id> slide --index N --instruction "…"` |
| `reorder_slides` | `dazero post <slug> <id> reorder --order "0,2,1"` |
| `make_video` | `dazero post <slug> <id> video …` |

## Plans

| MCP | CLI |
|-----|-----|
| `get_plan` | `dazero plan <slug>` |
| `propose_plan` / `revise_plan` / `approve_plan` / `discard_plan` | `dazero plan <slug> propose\|revise\|approve\|discard` |
| `save_brief` / `replan_week` | `dazero plan <slug> save-brief\|replan --week N …` |
| `get_weekly_plan` | `dazero weekly-plan <slug>` |
| `plan_week` / `produce_week` | `dazero weekly-plan <slug> plan\|produce --week N` |

## Studio

| MCP | CLI |
|-----|-----|
| `get_studio` | `dazero studio <slug>` |
| `update_brand_kit` / `set_colors` | `dazero studio <slug> kit-update\|colors …` |
| `add_note` / `delete_document` | `dazero studio <slug> add-note\|delete-doc …` |
| `add_person` / `generate_person` / `delete_person` | `dazero studio <slug> people-*` |
| `add_competitor` / `delete_competitor` / `research_competitors` | `dazero studio <slug> add-competitor\|…\|research` |
| `sync_history` | `dazero studio <slug> sync-history` |

## SEO / GEO / blog / ads / AI

| MCP | CLI |
|-----|-----|
| `get_seo` / `seo_action` | `dazero seo <slug> [run\|plan\|…]` |
| `get_geo` / `geo_action` | `dazero geo <slug> [run\|fix]` |
| `get_keywords` / `refresh_keywords` | `dazero keywords <slug> [refresh]` |
| `list_articles` / `generate_article` / `optimize_article` | `dazero web <slug> …` |
| `publish_article` / `unpublish_article` / `delete_article` | `dazero web <slug> publish\|…` |
| `get_ads` / `ads_action` | (ads via MCP / product UI) |
| `chat` | `dazero ai <slug> --message "…" --pipe` |
