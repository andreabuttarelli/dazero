# dazero

> **An infinite canvas of real terminals for orchestrating AI agents in parallel.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-pre--alpha%20(M1)-orange)](#roadmap)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)](#installation)

Dazero is an open-source tool that turns your computer into a command deck for multiple AI agents (Claude Code, Codex, Gemini CLI, opencode, Kimi Code, and others) working **together** on the same project. Instead of a single chat with one AI, you get a **zoomable canvas** where every node is a real terminal on your machine, and you can put a different agent in each one. Agents can talk to each other, delegate tasks, and you watch everything happen in real time.

---

## Table of contents

- [Why dazero?](#why-dazero)
- [What you will see](#what-you-will-see)
- [Key features](#key-features)
- [Installation](#installation)
- [Getting started](#getting-started)
- [How it works](#how-it-works-under-the-hood)
- [System requirements](#system-requirements)
- [Roadmap](#roadmap)
- [Development and contributions](#development-and-contributions)
- [FAQ](#faq)
- [License](#license)

---

## Why dazero?

If you have ever had **multiple terminal tabs open with different AI agents** — one writing code, one fixing tests, one updating docs — you already know the problem: switching tabs manually, copying output between chats, losing track of which agent is doing what.

**Dazero solves this with three precise design choices:**

1. **Agents live inside real terminals on your machine.** Not a proxy, not a wrapper. They are exactly the same `claude-code`, `codex`, `gemini` you launch from the command line. You use **your subscriptions**, **your API keys**, **your config** — dazero does not intercept anything and never sees your tokens.
2. **An infinite canvas keeps them all in view.** Drag, zoom, draw visible arrows between agents, add Markdown notes and task lists in the same space. It is the difference between 15 Chrome tabs and a Figma board.
3. **Agents can collaborate.** An agent can create a list of sub-tasks and assign them to new agents that are spawned automatically. The arrows on the canvas show who delegated what to whom.

**No dazero account. No cloud. No telemetry.** It is a single binary running on your machine, talking to the browser locally, and nothing else.

---

## What you will see

> **Note:** screenshots and GIFs will be added when M2 (canvas) is complete. For now M1 exposes a single live terminal as a proof-of-concept.

After `npx dazero start`:

- Your default browser opens `http://localhost:7000`.
- A dark board with a grid: the **canvas**.
- "+ New project" button: create a project by picking a folder or pasting a GitHub repo URL (it will be cloned locally).
- Inside the project: drag a **Terminal** node, pick `claude-code` (or any other preset), and a real shell starts in that folder with the agent ready.
- Drag a **Task-List** node, write 3 things to do, click "Run all" → 3 side-by-side terminals open, one per task, each with the agent you chose.
- While agents work, you watch the arrows grow: every agent that decides to delegate appears connected to its child on the canvas.

---

## Key features

### Available today (M1 — pre-alpha)
- ✅ Single binary distributed via `npx dazero` (cross-platform)
- ✅ React UI served locally at `http://localhost:7000`
- ✅ Real interactive terminal (PTY) in the browser via xterm.js
- ✅ Automatic browser launch on startup
- ✅ MIT open source, zero telemetry

### Coming soon
- 🟡 **M2** — Infinite React Flow canvas, project dashboard, "+ New project" wizard with GitHub clone, SQLite persistence
- 🟡 **M3** — Task-list with parallel agent spawn, detached tmux sessions (agents survive a close), parent→child edges
- 🟡 **M4** — Local MCP server with ~10 tools; agents can create/delegate tasks, explicit context bundle, configurable budget cap
- 🟡 **M5** — Markdown notes on canvas, `cmd+P` project switcher, Homebrew cask, Apple code signing + notarization, docs site

See the [full roadmap](#roadmap) for details.

---

## Installation

### The quick way (recommended)

If you have **Node.js** and **bun** or **npm** installed:

```bash
npx dazero start
```

Done. The browser opens automatically. `npx` downloads and runs the correct binary for your system with no permanent installation.

If you prefer a persistent install:

```bash
# with bun (recommended, faster)
bun i -g dazero
dazero start

# or with npm
npm i -g dazero
dazero start
```

### If you do not have Node or bun

Node.js is required because the primary distribution is via npm (the binary itself is written in Rust). Install it like this:

**macOS:**
```bash
brew install bun        # covers everything (bun includes a Node-compatible runtime)
```

**Linux / Windows:**
- Node: download from [nodejs.org](https://nodejs.org) (LTS).
- Bun: `curl -fsSL https://bun.sh/install | bash`.

Then return to the **quick way** above.

### Other channels

- **Homebrew (coming with M5):** `brew install dazero`
- **Cargo (for Rustaceans):** `cargo install dazero`
- **GitHub Releases:** direct download of `.tar.gz` / `.zip` from the [Releases page](https://github.com/andreabuttarelli/dazero/releases)

---

## Getting started

1. **Start dazero:**
   ```bash
   npx dazero start
   ```
   The browser opens `http://localhost:7000` automatically. If it does not, open it manually.

2. **In M1** (current state): you will see a live terminal in the UI. Type `ls`, `pwd`, or any command — it is a real shell on your machine running in the browser.

3. **When M2+ arrives:** click "+ New project", pick a folder or repo, and create terminal nodes, task-lists, and notes on the canvas. Each terminal node can host a different AI agent.

4. **To close:** close the browser tab. In M1 this also kills the terminals (they are ephemeral); in M3, detached tmux sessions will keep them alive between sessions.

---

## How it works (under the hood)

Dazero is a **single Rust binary** that on startup does three things:

```
 Your browser (Chrome/Arc/Safari/Firefox)
        │  ← navigates http://localhost:7000
        ▼
 ┌──────────────────── dazero binary (Rust) ─────────────────────┐
 │                                                               │
 │  HTTP+WebSocket server    ←→   PTY/tmux management            │
 │  (serves UI + events)          (real terminals on your PC)    │
 │          ↑                                                    │
 │          │              React UI embedded in the binary       │
 │          │              (served statically)                   │
 │          │                                                    │
 │     Local MCP server ← structured tools for AI agents         │
 │     (~/.dazero/mcp.sock)                                      │
 └───────────────────────────────────────────────────────────────┘
```

**Key design points:**

- **No Electron, no native webviews.** Dazero uses the browser you already have. This means a very small bundle, no Apple signing required to get started, and as a bonus you can access dazero remotely via SSH tunnel (`ssh -L 7000:localhost:7000 <server>`) — handy if you have a powerful workstation at the office and a laptop on the road.
- **Agents are separate processes.** Dazero spawns `claude-code`, `codex`, or whatever you choose in a detached tmux session (from M3) and captures PTY bytes to display them in xterm.js in the browser. When you type in the browser terminal, bytes go back into the same PTY. It is a real terminal in every sense: `vim`, `htop`, zsh autocompletion — all work.
- **Agents talk to the canvas via MCP.** From M4 onwards, every MCP-compatible agent (Claude Code, Codex, Gemini CLI natively) can call tools like `spawn_agent`, `create_task`, `update_task_status` — and dazero turns these into new nodes, edges, and status updates on the canvas.

**Full design doc:** [`docs/plans/2026-04-18-dazero-design.md`](./docs/plans/2026-04-18-dazero-design.md).

---

## System requirements

**End users** (just running `npx dazero`): Node 18+, bun or npm, a POSIX shell (bash/zsh/fish) or PowerShell. tmux will become an optional dependency from M3.

**Developers** (contributing to the code): Rust 1.83, bun 1.2+, git, gh, tmux, Node 18+.

Full list with versions, links, and a one-shot setup script: **[REQUIREMENTS.md](./REQUIREMENTS.md)**.

---

## Roadmap

Dazero is built incrementally across 5 milestones. Each milestone is a releasable MVP on its own.

| Milestone | Goal | Status |
|-----------|------|--------|
| **M1 Foundations** | `npx dazero start` opens a real shell in the browser. Rust daemon + React UI + WS↔PTY bridge + cross-platform npm packaging. | 🟢 **in progress** |
| **M2 Canvas & Projects** | Infinite React Flow canvas, project dashboard with sidebar, "+ New project" wizard with GitHub clone, SQLite persistence. | ⚪ planned |
| **M3 Multi-agent & Task-list** | Agent-type presets (Claude Code, Codex, Gemini CLI, opencode, custom), Task-List node with parallel spawn, detached tmux sessions (persistence), parent→child edges. | ⚪ planned |
| **M4 MCP & Orchestration** | Local MCP server with ~10 tools, agents can create/delegate tasks, explicit context bundle, configurable budget cap. | ⚪ planned |
| **M5 Polish & Release** | Markdown notes on canvas, `cmd+P` switcher, Homebrew cask, Apple code signing + notarization, docs site. | ⚪ planned |

Detailed M1 plan: [`docs/plans/2026-04-18-dazero-m1-foundations.md`](./docs/plans/2026-04-18-dazero-m1-foundations.md).

---

## Development and contributions

### Local setup

```bash
# Install prerequisites (macOS)
brew install node bun gh tmux git
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.83
. "$HOME/.cargo/env"

# Clone and prepare
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero

# UI dependencies
cd ui && bun install && cd -

# First build (downloads Rust crates, ~2-3 min)
cargo build
```

Full setup for Linux/Windows and version verification: see [REQUIREMENTS.md](./REQUIREMENTS.md).

### Development workflow with hot-reload

```bash
# Terminal 1 — Rust daemon
cargo run -p dazero -- start --no-open

# Terminal 2 — Vite UI in dev mode (HMR)
cd ui && bun run dev

# Open http://localhost:5173 (vite dev proxies API calls to the daemon)
```

### Tests

```bash
cargo test --all --locked      # Rust (unit + integration)
cd ui && bun run typecheck     # TypeScript strict
cd ui && bun run build         # UI prod build smoke
```

### Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- **PRs:** one commit per task following the implementation plan; CI must pass (fmt, clippy strict, tests).
- **Commit messages, PRs, design docs, and README:** English.

### Contributing

Issues, discussions, and PRs are welcome. Before opening a large PR:
1. Open an issue to propose the change.
2. Read the [design doc](./docs/plans/2026-04-18-dazero-design.md) to understand the architectural constraints.
3. Follow the current milestone plan if you are contributing to M2/M3/M4/M5.

For small changes (typo fixes, local refactors, docs), a direct PR is fine.

---

## FAQ

**Is it ready to use?**
No — we are in **pre-alpha (M1)**. In M1 there is only a single terminal in the browser. The canvas, tasks, and agents will arrive with M2-M4. You can install it to take a look and follow development, but wait for M3 for daily use.

**How does it handle agent API keys?**
**It does not.** This is the key design choice: dazero launches `claude-code`, `codex`, `gemini` as sub-processes that read their own config (`~/.claude/`, `~/.codex/`, `~/.config/gemini/...`) exactly as if you launched them from the shell. Dazero never sees the tokens, does not proxy the calls, and syncs nothing to the cloud.

**Can I use self-hosted AI agents?**
Yes — any CLI that runs in a shell works. In M3 you can define a "custom" preset with any command (e.g. `ollama run llama3.1`, `aider --model local`, whatever you want).

**Does it work on Windows?**
Yes, but M1 is tested primarily on macOS and Linux. Windows is supported via the `@dazero/windows-x64` package. tmux on Windows requires WSL (it is a prerequisite from M3).

**How is this different from Warp, Hyper, Wave Terminal?**
Those are **terminals with integrated AI**. Dazero is an **orchestration canvas** that uses existing AI agents in real terminals. If you love a specific terminal, keep using it for your daily shell — dazero is only for when you want multiple coordinated agents on a project.

**Can I access dazero remotely?**
Yes, with SSH port forwarding:
```bash
ssh -L 7000:localhost:7000 powerful-workstation
# On the remote workstation
npx dazero start --no-open
# On the local laptop open http://localhost:7000
```
The heavy computation (agents, builds, tests) runs on the workstation; the local browser is just a frontend.

**The repo is called "dazero" — what does it mean?**
`"dazero"` = `"da zero"` in Italian = `"from scratch"`. It is the original code name and may be renamed before M5.

---

## License

[MIT](./LICENSE) — use it, fork it, modify it, sell it. No restrictions beyond preserving the copyright notice.

---

## Credits

Built with [Rust](https://www.rust-lang.org/), [axum](https://github.com/tokio-rs/axum), [portable-pty](https://github.com/wez/wezterm/tree/main/pty), [React](https://react.dev/), [React Flow](https://reactflow.dev/), [xterm.js](https://xtermjs.org/), [Vite](https://vitejs.dev/), [bun](https://bun.sh/).

Inspired by Figma/tldraw (canvas UX), VS Code/Warp (terminal UX), tmux (persistence), and the CLI-first ecosystem in the tradition of Jupyter/OpenWebUI/Supabase.
