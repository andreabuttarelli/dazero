# feega CLI (fallback)

Use when MCP is not connected. Same OAuth session as MCP (`~/.config/feega/session.json`).

## Install

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/feega/main/cli/scripts/install.sh | bash
feega login
```

From source (Bun):

```bash
git clone https://github.com/andreabuttarelli/feega.git
cd feega-cli && bun install
bun run cli.ts --help
```

## Common commands

```bash
feega brands
feega dashboard <slug>
feega content <slug> --status pending_user
feega approve <slug> --all
feega post <slug> <id> edit --caption "..."
feega post <slug> <id> regenerate --instruction "..."
feega post <slug> <id> slide --index 1 --instruction "..."
feega post <slug> <id> approve|publish|reject
feega plan <slug> propose
feega weekly-plan <slug> plan --week 0
feega weekly-plan <slug> produce --week 0
feega studio <slug> add-note --text "..."
feega seo <slug>
feega geo <slug>
feega web <slug> generate --topic "..."
feega ai <slug> --message "..." --pipe
```

Full dump: repo root [`llms.txt`](https://github.com/andreabuttarelli/feega/blob/main/cli/llms.txt).
Tool mapping: [tools.md](tools.md).
