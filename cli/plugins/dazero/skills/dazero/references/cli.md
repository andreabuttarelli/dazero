# dazero CLI (fallback)

Use when MCP is not connected. Same OAuth session as MCP (`~/.config/dazero/session.json`).

## Install

```bash
curl -sSL https://raw.githubusercontent.com/andreabuttarelli/dazero/main/cli/scripts/install.sh | bash
dazero login
```

From source (Bun):

```bash
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero-cli && bun install
bun run cli.ts --help
```

## Common commands

```bash
dazero brands
dazero dashboard <slug>
dazero content <slug> --status pending_user
dazero approve <slug> --all
dazero post <slug> <id> edit --caption "..."
dazero post <slug> <id> regenerate --instruction "..."
dazero post <slug> <id> slide --index 1 --instruction "..."
dazero post <slug> <id> approve|publish|reject
dazero plan <slug> propose
dazero weekly-plan <slug> plan --week 0
dazero weekly-plan <slug> produce --week 0
dazero studio <slug> add-note --text "..."
dazero seo <slug>
dazero geo <slug>
dazero web <slug> generate --topic "..."
```

Full dump: repo root [`llms.txt`](https://github.com/andreabuttarelli/dazero/blob/main/cli/llms.txt).
Tool mapping: [tools.md](tools.md).
