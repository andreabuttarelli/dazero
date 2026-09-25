# feega MCP tools ↔ CLI

All tools take a brand `slug` when brand-scoped. Ids accept short unambiguous prefixes.

## Auth

| MCP | CLI |
|-----|-----|
| `login` | `feega login` |
| `logout` | `feega logout` |
| `whoami` | (session file / brands imply identity) |
| `list_brands` | `feega brands` |

## Brand & posts

| MCP | CLI |
|-----|-----|
| `get_dashboard` | `feega dashboard <slug>` |
| `get_status` | `feega status <slug>` |
| `get_analytics` | `feega analytics <slug>` |
| `get_calendar` | `feega calendar <slug> [--month YYYY-MM]` |
| `get_gtm` | `feega gtm <slug>` |
| `get_voice` / `update_voice` | `feega voice <slug>` |
| `list_posts` | `feega content <slug> [--status …]` |
| `approve_posts` | `feega approve <slug> --all` |
| `get_post` | `feega post <slug> <id>` |
| `edit_post` | `feega post <slug> <id> edit …` |
| `approve_post` / `publish_post` / `reject_post` | `feega post <slug> <id> approve\|publish\|reject` |
| `reschedule_post` | `feega post <slug> <id> reschedule --scheduledFor …` |
| `render_post` | `feega post <slug> <id> render` |
| `regenerate_post_media` | `feega post <slug> <id> regenerate --instruction "…"` |
| `regenerate_slide` | `feega post <slug> <id> slide --index N --instruction "…"` |
| `reorder_slides` | `feega post <slug> <id> reorder --order "0,2,1"` |
| `make_video` | `feega post <slug> <id> video …` |

## Plans

| MCP | CLI |
|-----|-----|
| `get_plan` | `feega plan <slug>` |
| `propose_plan` / `revise_plan` / `approve_plan` / `discard_plan` | `feega plan <slug> propose\|revise\|approve\|discard` |
| `save_brief` / `replan_week` | `feega plan <slug> save-brief\|replan --week N …` |
| `get_weekly_plan` | `feega weekly-plan <slug>` |
| `plan_week` / `produce_week` | `feega weekly-plan <slug> plan\|produce --week N` |

## Studio

| MCP | CLI |
|-----|-----|
| `get_studio` | `feega studio <slug>` |
| `update_brand_kit` / `set_colors` | `feega studio <slug> kit-update\|colors …` |
| `add_note` / `delete_document` | `feega studio <slug> add-note\|delete-doc …` |
| `add_person` / `generate_person` / `delete_person` | `feega studio <slug> people-*` |
| `add_competitor` / `delete_competitor` / `research_competitors` | `feega studio <slug> add-competitor\|…\|research` |
| `sync_history` | `feega studio <slug> sync-history` |

## SEO / GEO / blog / ads / AI

| MCP | CLI |
|-----|-----|
| `get_seo` / `seo_action` | `feega seo <slug> [run\|plan\|…]` |
| `get_geo` / `geo_action` | `feega geo <slug> [run\|fix]` |
| `get_keywords` / `refresh_keywords` | `feega keywords <slug> [refresh]` |
| `list_articles` / `generate_article` / `optimize_article` | `feega web <slug> …` |
| `publish_article` / `unpublish_article` / `delete_article` | `feega web <slug> publish\|…` |
| `get_ads` / `ads_action` | (ads via MCP / product UI) |
| `chat` | `feega ai <slug> --message "…" --pipe` |
