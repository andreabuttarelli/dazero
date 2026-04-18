# dazero — Requirements

Tool e versioni necessarie per usare e sviluppare dazero. Split tra **runtime** (ciò che serve all'utente finale per lanciare `npx dazero`) e **development** (ciò che serve per contribuire al codice).

---

## Runtime (utente finale)

Per eseguire `npx dazero start`:

| Tool | Versione minima | Obbligatorio | Scopo | Install |
|------|-----------------|--------------|-------|---------|
| **Node.js** | 18.x | ✅ | Lancia lo stub npm che invoca il binario nativo. `npx`/`bunx` derivano da qui. | [nodejs.org](https://nodejs.org) o `brew install node` |
| **npm** o **bun** | npm 9+ / bun 1.2+ | ✅ | Uno dei due per invocare `npx dazero` / `bunx dazero`. Bun è raccomandato per velocità. | npm viene con Node; `curl -fsSL https://bun.sh/install \| bash` |
| **tmux** | 3.3+ | ⚠️ M3+ | Persistenza sessioni terminali detached. In M1 non richiesto, necessario da M3 in poi. | `brew install tmux` (macOS) · `apt install tmux` (Linux) |
| **gh CLI** | 2.0+ | ⚪ opzionale | Abilita la feature "info repo live" nella dashboard progetti (M2+). Senza di esso la feature è silenziosamente disabilitata. | [cli.github.com](https://cli.github.com) o `brew install gh`. Poi `gh auth login` una volta. |
| **Shell bash/zsh/fish** | qualsiasi versione moderna | ✅ | PTY target — dazero apre il tuo `$SHELL`. | Pre-installato su macOS/Linux. |

**Sistemi operativi supportati (binari pre-buildati):**
- macOS Apple Silicon (`darwin-arm64`)
- macOS Intel (`darwin-x64`)
- Linux x86_64 (`linux-x64`)
- Linux ARM64 (`linux-arm64`)
- Windows x86_64 (`windows-x64`)

---

## Development (contributor)

Per clonare il repo, buildarlo e contribuire:

| Tool | Versione minima | Obbligatorio | Scopo | Install |
|------|-----------------|--------------|-------|---------|
| **rustc** + **cargo** | 1.83 (pinnata in `rust-toolchain.toml`) | ✅ | Compila il daemon Rust. | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh -s -- -y --default-toolchain 1.83` |
| **rustfmt** + **clippy** | stessa versione di rustc | ✅ | Lint/format gate in CI. Installati automaticamente da `rust-toolchain.toml`. | Auto con rustup |
| **bun** | 1.2+ | ✅ | Package manager e builder della UI React/Vite. | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** | 18.x | ✅ | Runtime per `npx`/stub npm e postinstall hooks. | [nodejs.org](https://nodejs.org) o `brew install node` |
| **git** | 2.30+ | ✅ | SCM. | `brew install git` · `apt install git` |
| **gh CLI** | 2.0+ | ✅ | Gestione PR/release, secret `NPM_TOKEN` per CI. | `brew install gh` |
| **tmux** | 3.3+ | ✅ | Dipendenza runtime dei test di integrazione da M3 in poi. | `brew install tmux` |
| **cross-rs** | 0.2+ | ⚪ opzionale | Cross-compile `aarch64-unknown-linux-gnu` in release pipeline. Installato automaticamente dal workflow di CI; utile in locale solo per debug. | `cargo install cross --locked` |

**Target Rust addizionali** (per build cross-platform in locale):

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin \
                  x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu \
                  x86_64-pc-windows-msvc
```

---

## Setup one-shot (macOS)

```bash
# 1. Runtime + development toolchain
brew install node bun gh tmux git
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.83
. "$HOME/.cargo/env"

# 2. Clona
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero

# 3. Sviluppa
cd ui && bun install && cd -   # UI deps
cargo build                    # Rust deps
cargo test --all               # smoke
```

## Setup one-shot (Linux/Debian)

```bash
sudo apt update && sudo apt install -y git tmux curl build-essential pkg-config libssl-dev
curl -fsSL https://bun.sh/install | bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.83
# gh CLI: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
```

---

## Verifica ambiente

```bash
rustc --version   # → 1.83.x
cargo --version   # → 1.83.x
bun --version     # → 1.2.x+
node --version    # → v18+
git --version     # → 2.30+
gh --version      # → 2.x
tmux -V           # → tmux 3.3+
```

Se manca qualcosa, consulta la sezione runtime o development sopra.

---

## Note

- `Cargo.lock` è gitignored fino a M5 (workspace ancora fluido). Verrà committato per binari riproducibili al primo release stabile.
- Nessun Apple Developer ID richiesto per sviluppo. Per la release firmata (M5) serve account Apple Developer ($99/anno); in fase alpha si usa ad-hoc signing.
- Nessun account npm richiesto per sviluppo. Solo il maintainer del repo ha bisogno del secret `NPM_TOKEN` per la pipeline `release.yml`.
