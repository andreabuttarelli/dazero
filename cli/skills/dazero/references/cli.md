# dazero CLI (fallback)

Use when MCP is not connected. Same OAuth session as MCP (`~/.config/dazero/session.json`).
Every command is brand-scoped (`dazero <command> <slug>`).

## Install

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/dazero/main/cli/scripts/install.sh | bash
dazero login
```

From source (Bun):

```bash
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero/cli && bun install
bun run cli.ts --help
```

## Commands

```bash
dazero brands                                    # List brands
dazero status <slug>                             # Pending posts, quota, last runs
dazero health                                     # Check Supabase / Gemini / Zernio
dazero dashboard <slug>                          # Brand overview
dazero content <slug> [--status pending_user]    # Posts, filtered by status
dazero content <slug> --clear pending_user       # Bulk-delete posts in that status
dazero approve <slug> [--all] [--dry]            # Approve pending posts
dazero calendar <slug> [--month YYYY-MM]         # Monthly scheduled posts
dazero post <slug> <id>                          # Show a post
dazero post <slug> <id> edit --caption "..."     # Edit fields (no render, no credits)
dazero post <slug> <id> render                   # Draw the missing image from its prompt
dazero post <slug> <id> approve|publish|reject   # Move it forward
dazero post <slug> <id> reschedule --scheduledFor "2026-06-20T10:00"
dazero products <slug> [sync]                    # List, or re-import from the connected store
dazero ads <slug> [--propose|--remix|--sync]     # Ad campaigns, spend, boost candidates
dazero ads <slug> --create --name "..." --headline "..." [--platform metaads] [--budget N]
dazero ads <slug> --approve <id> | --reject <id> | --pause <id> | --resume <id>
dazero ads <slug> --duplicate <id> | --delete <id>
dazero upgrade <slug>                            # Open billing checkout
dazero update                                    # Update the CLI itself
```

`--id` and post/ad ids accept the short prefix printed in the tables. Full command reference and
flags: [`cli/README.md`](../../../README.md).

## MCP instead

MCP reaches the whole org directly (`query`, `insert_row`, `create_post`, `run_node_generation`,
…) and is preferred when connected — see [mcp.md](mcp.md). Tool ↔ command mapping:
[tools.md](tools.md).
