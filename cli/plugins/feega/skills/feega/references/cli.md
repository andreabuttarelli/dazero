# feega CLI (fallback)

Use when MCP is not connected. Same OAuth session as MCP (`~/.config/feega/session.json`).
Every command is brand-scoped (`feega <command> <slug>`).

## Install

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/dazero/main/cli/scripts/install.sh | bash
feega login
```

From source (Bun):

```bash
git clone https://github.com/andreabuttarelli/dazero.git
cd feega/cli && bun install
bun run cli.ts --help
```

## Commands

```bash
feega brands                                    # List brands
feega status <slug>                             # Pending posts, quota, last runs
feega health                                     # Check Supabase / Gemini / Zernio
feega dashboard <slug>                          # Brand overview
feega content <slug> [--status pending_user]    # Posts, filtered by status
feega content <slug> --clear pending_user       # Bulk-delete posts in that status
feega approve <slug> [--all] [--dry]            # Approve pending posts
feega calendar <slug> [--month YYYY-MM]         # Monthly scheduled posts
feega post <slug> <id>                          # Show a post
feega post <slug> <id> edit --caption "..."     # Edit fields (no render, no credits)
feega post <slug> <id> render                   # Draw the missing image from its prompt
feega post <slug> <id> approve|publish|reject   # Move it forward
feega post <slug> <id> reschedule --scheduledFor "2026-06-20T10:00"
feega products <slug> [sync]                    # List, or re-import from the connected store
feega ads <slug> [--propose|--remix|--sync]     # Ad campaigns, spend, boost candidates
feega ads <slug> --create --name "..." --headline "..." [--platform metaads] [--budget N]
feega ads <slug> --approve <id> | --reject <id> | --pause <id> | --resume <id>
feega ads <slug> --duplicate <id> | --delete <id>
feega upgrade <slug>                            # Open billing checkout
feega update                                    # Update the CLI itself
```

`--id` and post/ad ids accept the short prefix printed in the tables. Full command reference and
flags: [`cli/README.md`](../../../README.md).

## MCP instead

MCP reaches the whole org directly (`query`, `insert_row`, `create_post`, `run_node_generation`,
…) and is preferred when connected — see [mcp.md](mcp.md). Tool ↔ command mapping:
[tools.md](tools.md).
