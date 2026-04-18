# dazero — Requirements

Tools and versions required to use and develop dazero. Split between **runtime** (what the end user needs to run `npx dazero`) and **development** (what contributors need to build the code).

---

## Runtime (end user)

To run `npx dazero start`:

| Tool | Minimum version | Required | Purpose | Install |
|------|-----------------|----------|---------|---------|
| **Node.js** | 18.x | ✅ | Runs the npm stub that invokes the native binary. `npx`/`bunx` derive from this. | [nodejs.org](https://nodejs.org) or `brew install node` |
| **npm** or **bun** | npm 9+ / bun 1.2+ | ✅ | One of the two to invoke `npx dazero` / `bunx dazero`. bun is recommended for speed. | npm comes with Node; `curl -fsSL https://bun.sh/install \| bash` |
| **tmux** | 3.3+ | ⚠️ M3+ | Detached terminal session persistence. Not required in M1; required from M3 onwards. | `brew install tmux` (macOS) · `apt install tmux` (Linux) |
| **gh CLI** | 2.0+ | ⚪ optional | Enables the "live repo info" feature in the project dashboard (M2+). Without it the feature is silently disabled. | [cli.github.com](https://cli.github.com) or `brew install gh`. Then `gh auth login` once. |
| **bash/zsh/fish shell** | any modern version | ✅ | PTY target — dazero opens your `$SHELL`. | Pre-installed on macOS/Linux. |

**Supported operating systems (pre-built binaries):**
- macOS Apple Silicon (`darwin-arm64`)
- macOS Intel (`darwin-x64`)
- Linux x86_64 (`linux-x64`)
- Linux ARM64 (`linux-arm64`)
- Windows x86_64 (`windows-x64`)

---

## Development (contributor)

To clone the repo, build it, and contribute:

| Tool | Minimum version | Required | Purpose | Install |
|------|-----------------|----------|---------|---------|
| **rustc** + **cargo** | 1.83 (pinned in `rust-toolchain.toml`) | ✅ | Compiles the Rust daemon. | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh -s -- -y --default-toolchain 1.83` |
| **rustfmt** + **clippy** | same version as rustc | ✅ | Lint/format gate in CI. Installed automatically by `rust-toolchain.toml`. | Auto via rustup |
| **bun** | 1.2+ | ✅ | Package manager and builder for the React/Vite UI. | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** | 18.x | ✅ | Runtime for `npx`/npm stub and postinstall hooks. | [nodejs.org](https://nodejs.org) or `brew install node` |
| **git** | 2.30+ | ✅ | SCM. | `brew install git` · `apt install git` |
| **gh CLI** | 2.0+ | ✅ | PR/release management, `NPM_TOKEN` secret for CI. | `brew install gh` |
| **tmux** | 3.3+ | ✅ | Runtime dependency for integration tests from M3 onwards. | `brew install tmux` |
| **cross-rs** | 0.2+ | ⚪ optional | Cross-compiles `aarch64-unknown-linux-gnu` in the release pipeline. Installed automatically by the CI workflow; useful locally only for debugging. | `cargo install cross --locked` |

**Additional Rust targets** (for local cross-platform builds):

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

# 2. Clone
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero

# 3. Develop
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

## Environment check

```bash
rustc --version   # → 1.83.x
cargo --version   # → 1.83.x
bun --version     # → 1.2.x+
node --version    # → v18+
git --version     # → 2.30+
gh --version      # → 2.x
tmux -V           # → tmux 3.3+
```

If anything is missing, refer to the runtime or development section above.

---

## Notes

- `Cargo.lock` is gitignored until M5 (workspace still in flux). It will be committed for reproducible binaries at the first stable release.
- No Apple Developer ID is required for development. For the signed release (M5) an Apple Developer account ($99/year) is needed; during alpha, ad-hoc signing is used.
- No npm account is required for development. Only the repo maintainer needs the `NPM_TOKEN` secret for the `release.yml` pipeline.
