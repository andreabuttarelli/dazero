# Dazero — Milestone 1: Foundations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Un binario Rust `dazero` distribuibile via `npx dazero` che serve una UI React locale su `http://localhost:7000`, apre una tab nel browser, e mostra **una shell bash reale interattiva** dentro un nodo terminale xterm.js. Zero canvas, zero task-list, zero MCP — solo la spina dorsale daemon+UI+PTY+WS+packaging.

**Architettura:** Cargo workspace (Rust) + ui bun/Vite (React+TS). Il daemon axum serve HTTP+WebSocket su `:7000` e embedda gli asset UI via `rust-embed`. PTY gestita con `portable-pty` dentro task tokio, streammata a xterm.js via WebSocket binario. Packaging npm con pattern `optionalDependencies` per distribuzione per-piattaforma (stesso pattern di biome/esbuild/swc).

**Tech Stack:**
- **Rust:** axum, tokio, tower-http, portable-pty, rust-embed, rusqlite, refinery, serde, serde_json, uuid, anyhow, tracing, tracing-subscriber, clap, futures-util.
- **UI:** React 19, TypeScript 5, Vite 6, `@xterm/xterm`, `@xterm/addon-fit`, zustand.
- **Tooling:** bun, cargo, GitHub Actions, cross-rs o zigbuild per cross-compile.

**Fuori scope M1 (rimandati):** canvas/React Flow, note, task-list, MCP server, tmux detached, multi-progetto, git clone, Apple code signing, Homebrew, auto-update.

**Reference progetto di pattern distribuzione:** `biomejs/biome` (stub npm + platform packages), `microsoft/node-pty` (uso PTY), `xtermjs/xterm.js` README.

---

## Struttura repo al termine di M1

```
dazero/
├── Cargo.toml                          # workspace
├── rust-toolchain.toml
├── crates/
│   └── dazero/
│       ├── Cargo.toml
│       ├── build.rs                    # build UI + rust-embed
│       └── src/
│           ├── main.rs
│           ├── cli.rs
│           ├── http.rs
│           ├── ws.rs
│           ├── pty.rs
│           ├── ui_assets.rs
│           └── config.rs
├── ui/
│   ├── package.json
│   ├── bun.lock
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── Terminal.tsx
│       └── lib/
│           └── ws.ts
├── npm/
│   ├── dazero/                         # stub package
│   │   ├── package.json
│   │   ├── bin/dazero.js
│   │   └── postinstall.js
│   └── README-platforms.md             # how platform packages are generated
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── .gitignore
├── .editorconfig
└── docs/plans/2026-04-18-dazero-m1-foundations.md
```

---

## Roadmap milestone (contesto per M1)

- **M1 Foundations (questo plan)** — Binario + UI + PTY + npx distribution. Output: `npx dazero` apre browser con una shell interattiva.
- **M2 Canvas & Projects** — React Flow, persistenza SQLite, dashboard progetti, wizard "+ New project", clone da URL.
- **M3 Multi-agent & Task-list** — Preset agent-types, TaskListNode, spawn parallelo, edge parent→child, budget cap.
- **M4 MCP & Agent orchestration** — MCP server locale, tool surface (~10 tool), CLI helper, context bundle.
- **M5 Note, polish, release** — NoteNode Markdown, cmd+P switcher, Homebrew tap, notarization, docs sito.

---

## Pre-requisiti ambiente

L'engineer che esegue questo plan deve avere installati sulla macchina di sviluppo:

- `rustc` 1.80+ e `cargo` (via `rustup`)
- `bun` 1.2+ (via `curl -fsSL https://bun.sh/install | bash`)
- `git`, `gh` CLI
- `tmux` 3.3+ (non usato in M1 ma richiesto da M3 in poi; installa ora: `brew install tmux`)

Verifica con:
```bash
rustc --version && cargo --version && bun --version && git --version && gh --version && tmux -V
```

---

## Task 0: Bootstrap del repo e `.gitignore`

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `rust-toolchain.toml`
- Create: `Cargo.toml` (workspace)

**Step 1: Crea `.gitignore`**

```gitignore
# Rust
target/
Cargo.lock

# Node / bun
node_modules/
ui/dist/
bun.lockb
.vite/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp

# Dazero runtime
.dazero/
*.log
```

**Nota:** `Cargo.lock` è volutamente ignorato inizialmente perché è una library workspace. Dopo la prima release, considera di committarlo per binari riproducibili (vedi M5).

**Step 2: Crea `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{rs,toml}]
indent_size = 4

[Makefile]
indent_style = tab
```

**Step 3: Crea `rust-toolchain.toml`**

```toml
[toolchain]
channel = "1.83"
components = ["rustfmt", "clippy"]
```

**Step 4: Crea `Cargo.toml` workspace root**

```toml
[workspace]
resolver = "2"
members = ["crates/*"]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
repository = "https://github.com/andreabuttarelli/dazero"
authors = ["Andrea Buttarelli"]

[workspace.dependencies]
anyhow = "1"
axum = { version = "0.8", features = ["ws", "macros"] }
clap = { version = "4", features = ["derive"] }
futures-util = "0.3"
portable-pty = "0.9"
rust-embed = { version = "8", features = ["compression"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.6", features = ["trace", "cors"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
uuid = { version = "1", features = ["v4", "serde"] }
```

**Step 5: Commit**

```bash
git add .gitignore .editorconfig rust-toolchain.toml Cargo.toml
git commit -m "chore: bootstrap workspace, toolchain, ignores"
```

---

## Task 1: Crea il crate `dazero` (binario stub)

**Files:**
- Create: `crates/dazero/Cargo.toml`
- Create: `crates/dazero/src/main.rs`
- Create: `crates/dazero/src/cli.rs`
- Test: `crates/dazero/tests/smoke.rs`

**Step 1: Scrivi il test `smoke.rs` (deve fallire)**

```rust
// crates/dazero/tests/smoke.rs
use std::process::Command;

#[test]
fn cli_prints_version() {
    let output = Command::new(env!("CARGO_BIN_EXE_dazero"))
        .arg("--version")
        .output()
        .expect("failed to run dazero --version");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("dazero"), "expected 'dazero' in output, got: {stdout}");
    assert!(stdout.contains("0.1.0"), "expected '0.1.0' in output, got: {stdout}");
}
```

**Step 2: `Cargo.toml` del crate**

```toml
[package]
name = "dazero"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
authors.workspace = true

[[bin]]
name = "dazero"
path = "src/main.rs"

[dependencies]
anyhow.workspace = true
clap.workspace = true
serde.workspace = true
serde_json.workspace = true
tokio.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
```

**Step 3: Implementazione minimale `cli.rs`**

```rust
// crates/dazero/src/cli.rs
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "dazero", version, about = "dazero — infinite canvas of real terminals for parallel AI agents")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand)]
pub enum Command {
    /// Start the dazero daemon and open the UI
    Start {
        /// Port to listen on
        #[arg(long, default_value = "7000")]
        port: u16,
        /// Skip opening the browser automatically
        #[arg(long)]
        no_open: bool,
    },
    /// Print runtime info and exit
    Doctor,
}
```

**Step 4: Implementazione minimale `main.rs`**

```rust
// crates/dazero/src/main.rs
mod cli;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Command};

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("dazero=info,axum=info")))
        .init();

    let cli = Cli::parse();
    match cli.command {
        Some(Command::Start { port, no_open }) => {
            println!("start not yet implemented (port={port}, no_open={no_open})");
            Ok(())
        }
        Some(Command::Doctor) => {
            println!("dazero {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        None => {
            // Default behaviour: show help
            let mut cmd = <Cli as clap::CommandFactory>::command();
            cmd.print_help()?;
            println!();
            Ok(())
        }
    }
}
```

**Step 5: Esegui il test — deve passare**

Run: `cargo test -p dazero --test smoke`
Expected: `test cli_prints_version ... ok`

**Step 6: Commit**

```bash
git add crates/dazero
git commit -m "feat(cli): scaffold dazero binary with clap subcommands"
```

---

## Task 2: Crate `http` module con axum e `/health`

**Files:**
- Modify: `crates/dazero/Cargo.toml` (aggiungi axum, tower-http, futures-util)
- Create: `crates/dazero/src/http.rs`
- Modify: `crates/dazero/src/main.rs` (wire start command)
- Test: `crates/dazero/tests/http.rs`

**Step 1: Test end-to-end del server HTTP**

```rust
// crates/dazero/tests/http.rs
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

#[tokio::test]
async fn health_endpoint_responds_ok() {
    // Avvia server in un task separato su porta random
    let port = find_free_port();
    let handle = tokio::spawn(async move {
        dazero::http::serve(port).await.unwrap();
    });

    // Attendi che il server sia up (max 3s)
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let url = format!("http://127.0.0.1:{port}/health");
    let resp = reqwest::get(&url).await.expect("request failed");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));

    handle.abort();
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
```

**Step 2: Aggiungi `reqwest` come dev-dependency**

In `crates/dazero/Cargo.toml`:

```toml
[dependencies]
# ... esistenti ...
axum.workspace = true
tower-http.workspace = true
futures-util.workspace = true

[dev-dependencies]
reqwest = { version = "0.12", features = ["json"] }
tokio = { workspace = true, features = ["full", "test-util"] }
```

Esponi anche il modulo a test:

```toml
[lib]
name = "dazero"
path = "src/lib.rs"
```

**Step 3: Crea `src/lib.rs`**

```rust
// crates/dazero/src/lib.rs
pub mod cli;
pub mod http;
```

**Step 4: Implementa `http.rs`**

```rust
// crates/dazero/src/http.rs
use anyhow::Result;
use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing::info;

pub async fn serve(port: u16) -> Result<()> {
    let app = Router::new()
        .route("/health", get(health))
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!(%addr, "dazero listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
```

**Step 5: Wire `main.rs` per avviare il server**

Sostituisci il match arm `Command::Start`:

```rust
Some(Command::Start { port, no_open: _ }) => {
    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(dazero::http::serve(port))?;
    Ok(())
}
```

E togli `mod cli;` (è in lib ora), ma sposta `use cli::...` a `use dazero::cli::...`.

**Step 6: Esegui test — deve passare**

Run: `cargo test -p dazero --test http -- --nocapture`
Expected: `test health_endpoint_responds_ok ... ok`

**Step 7: Smoke test manuale**

```bash
cargo run -p dazero -- start --port 7000 --no-open &
sleep 1
curl -s http://127.0.0.1:7000/health | tee /dev/stderr | grep -q '"status":"ok"'
kill %1
```
Expected: stampa il JSON e exit code 0.

**Step 8: Commit**

```bash
git add crates/dazero
git commit -m "feat(http): add axum server with /health endpoint"
```

---

## Task 3: Scaffold UI React + Vite

**Files:**
- Create: `ui/package.json`
- Create: `ui/tsconfig.json`
- Create: `ui/vite.config.ts`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/src/App.tsx`

**Step 1: `ui/package.json`**

```json
{
  "name": "@dazero/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: `ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

**Step 3: `ui/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7000",
      "/ws": { target: "ws://127.0.0.1:7000", ws: true },
      "/health": "http://127.0.0.1:7000",
    },
  },
});
```

**Step 4: `ui/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>dazero</title>
  </head>
  <body style="margin:0;background:#0b0b0f;color:#eaeaea;font-family:ui-monospace,SFMono-Regular,monospace">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: `ui/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**Step 6: `ui/src/App.tsx` (placeholder)**

```tsx
import { useEffect, useState } from "react";

export function App() {
  const [status, setStatus] = useState<string>("…");
  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((j) => setStatus(`dazero v${j.version}`))
      .catch((e) => setStatus(`error: ${e.message}`));
  }, []);
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>dazero</h1>
      <p style={{ opacity: 0.7 }}>{status}</p>
    </main>
  );
}
```

**Step 7: Installa dipendenze e builda**

```bash
cd ui
bun install
bun run build
```
Expected: `dist/` creato con `index.html` e asset.

**Step 8: Dev smoke test**

In un terminale avvia il daemon: `cargo run -p dazero -- start --no-open`.
In un altro: `cd ui && bun run dev`. Apri `http://localhost:5173` — deve mostrare "dazero v0.1.0".

**Step 9: Commit**

```bash
git add ui package.json ui/bun.lock
git commit -m "feat(ui): scaffold React+Vite UI with /health proxy"
```

---

## Task 4: Embed UI nel binario via `rust-embed`

**Files:**
- Modify: `crates/dazero/Cargo.toml` (aggiungi rust-embed, mime_guess)
- Create: `crates/dazero/build.rs`
- Create: `crates/dazero/src/ui_assets.rs`
- Modify: `crates/dazero/src/lib.rs` (pub mod ui_assets)
- Modify: `crates/dazero/src/http.rs` (serve static fallback)
- Test: `crates/dazero/tests/static.rs`

**Step 1: Test per UI servita dalla root**

```rust
// crates/dazero/tests/static.rs
use std::time::Duration;
use tokio::net::TcpStream;

#[tokio::test]
async fn root_serves_index_html() {
    let port = find_free_port();
    tokio::spawn(async move { dazero::http::serve(port).await.unwrap(); });

    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let resp = reqwest::get(format!("http://127.0.0.1:{port}/")).await.unwrap();
    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    assert!(body.contains("<div id=\"root\">"), "expected React root in body");
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}
```

**Step 2: Aggiungi dipendenze**

```toml
[dependencies]
# ... esistenti ...
rust-embed.workspace = true
mime_guess = "2"
```

**Step 3: `build.rs` — builda UI prima di compilare**

```rust
// crates/dazero/build.rs
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let ui_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent().unwrap().parent().unwrap()
        .join("ui");

    println!("cargo:rerun-if-changed={}/src", ui_dir.display());
    println!("cargo:rerun-if-changed={}/index.html", ui_dir.display());
    println!("cargo:rerun-if-changed={}/package.json", ui_dir.display());

    // In modalità release builda sempre. In dev, builda solo se dist non esiste.
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let dist = ui_dir.join("dist");
    let should_build = profile == "release" || !dist.exists();

    if should_build {
        let status = Command::new("bun")
            .arg("run").arg("build")
            .current_dir(&ui_dir)
            .status()
            .expect("failed to invoke bun; is it installed?");
        if !status.success() {
            panic!("bun run build failed with status {status}");
        }
    } else {
        println!("cargo:warning=skipping UI build in dev (ui/dist already exists)");
    }
}
```

**Step 4: `ui_assets.rs`**

```rust
// crates/dazero/src/ui_assets.rs
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../../ui/dist/"]
pub struct Assets;
```

**Step 5: Modifica `http.rs` per servire gli asset**

Sostituisci il contenuto con:

```rust
use crate::ui_assets::Assets;
use anyhow::Result;
use axum::{
    body::Body,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing::info;

pub async fn serve(port: u16) -> Result<()> {
    let app = Router::new()
        .route("/health", get(health))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!(%addr, "dazero listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "version": env!("CARGO_PKG_VERSION") }))
}

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path).or_else(|| Assets::get("index.html")) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(file.data.into_owned()))
                .unwrap()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}
```

**Step 6: Aggiungi `pub mod ui_assets;` a `lib.rs`**

**Step 7: Build e test**

```bash
cargo test -p dazero --test static
```
Expected: PASS.

**Step 8: Smoke test manuale**

```bash
cargo run --release -p dazero -- start --port 7000 --no-open &
sleep 2
curl -s http://127.0.0.1:7000/ | grep -q 'id="root"'
kill %1
```

**Step 9: Commit**

```bash
git add crates/dazero ui
git commit -m "feat(ui-embed): serve React UI from binary via rust-embed"
```

---

## Task 5: Apertura browser automatica al `dazero start`

**Files:**
- Modify: `crates/dazero/Cargo.toml` (dipendenza `open` o `webbrowser`)
- Modify: `crates/dazero/src/main.rs`

**Step 1: Aggiungi `webbrowser`**

```toml
[dependencies]
webbrowser = "1"
```

**Step 2: Modifica handler `Start`**

```rust
Some(Command::Start { port, no_open }) => {
    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(async move {
        if !no_open {
            let url = format!("http://127.0.0.1:{port}");
            // Apri dopo ~500ms per dare tempo al server di bindarsi
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let _ = webbrowser::open(&url);
            });
        }
        dazero::http::serve(port).await
    })?;
    Ok(())
}
```

**Step 3: Smoke test manuale**

```bash
cargo run -p dazero -- start
```
Expected: il browser di default apre `http://127.0.0.1:7000` e mostra "dazero v0.1.0".

**Step 4: Commit**

```bash
git add crates/dazero
git commit -m "feat(cli): auto-open browser on dazero start"
```

---

## Task 6: WebSocket echo endpoint (smoke)

**Files:**
- Create: `crates/dazero/src/ws.rs`
- Modify: `crates/dazero/src/lib.rs`
- Modify: `crates/dazero/src/http.rs` (aggiungi route `/ws/echo`)
- Test: `crates/dazero/tests/ws.rs`

**Step 1: Test WebSocket echo**

```rust
// crates/dazero/tests/ws.rs
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn ws_echo_roundtrip() {
    let port = find_free_port();
    tokio::spawn(async move { dazero::http::serve(port).await.unwrap(); });

    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let url = format!("ws://127.0.0.1:{port}/ws/echo");
    let (mut ws, _) = connect_async(url).await.expect("connect failed");
    ws.send(Message::Text("hello".into())).await.unwrap();
    let msg = ws.next().await.unwrap().unwrap();
    assert_eq!(msg.to_text().unwrap(), "hello");
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}
```

**Step 2: Aggiungi `tokio-tungstenite` come dev-dep**

```toml
[dev-dependencies]
tokio-tungstenite = "0.24"
```

**Step 3: Implementa `ws.rs`**

```rust
// crates/dazero/src/ws.rs
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;

pub async fn echo_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(echo_socket)
}

async fn echo_socket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(t) => {
                if socket.send(Message::Text(t)).await.is_err() { break; }
            }
            Message::Binary(b) => {
                if socket.send(Message::Binary(b)).await.is_err() { break; }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
```

**Step 4: Wire in `http.rs`**

```rust
use crate::ws;
// ... nel Router::new()
.route("/ws/echo", get(ws::echo_handler))
```

E `pub mod ws;` in `lib.rs`.

**Step 5: Esegui test**

```bash
cargo test -p dazero --test ws
```
Expected: PASS.

**Step 6: Commit**

```bash
git add crates/dazero
git commit -m "feat(ws): add /ws/echo smoke endpoint"
```

---

## Task 7: PTY manager con `portable-pty`

**Files:**
- Create: `crates/dazero/src/pty.rs`
- Modify: `crates/dazero/src/lib.rs`
- Test: `crates/dazero/tests/pty.rs`

**Step 1: Test PTY spawn e read/write**

```rust
// crates/dazero/tests/pty.rs
use dazero::pty::PtySession;
use tokio::time::{timeout, Duration};

#[tokio::test]
async fn pty_echo_roundtrip() {
    let sess = PtySession::spawn_shell(None).expect("spawn");
    sess.write(b"echo hello-pty\n").await.expect("write");

    // Leggi fino a vedere "hello-pty" (max 3s)
    let mut buf = Vec::new();
    let res = timeout(Duration::from_secs(3), async {
        loop {
            let chunk = sess.read_some().await.expect("read");
            buf.extend_from_slice(&chunk);
            if String::from_utf8_lossy(&buf).contains("hello-pty") { break; }
        }
    }).await;
    assert!(res.is_ok(), "timed out waiting for echo output: {:?}", String::from_utf8_lossy(&buf));
}
```

**Step 2: Implementa `pty.rs`**

```rust
// crates/dazero/src/pty.rs
use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::task;

/// Una sessione PTY con shell figlio.
/// I byte in arrivo dalla shell sono disponibili via `read_some()`.
pub struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    rx: Arc<tokio::sync::Mutex<mpsc::UnboundedReceiver<Vec<u8>>>>,
    pub id: uuid::Uuid,
}

impl PtySession {
    /// Spawna una shell interattiva (`$SHELL` o `/bin/bash`) con cwd opzionale.
    pub fn spawn_shell(cwd: Option<PathBuf>) -> Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24, cols: 80, pixel_width: 0, pixel_height: 0,
        }).context("openpty failed")?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        if let Some(dir) = cwd { cmd.cwd(dir); }
        // Ensure TERM is set
        cmd.env("TERM", std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()));

        let _child = pair.slave.spawn_command(cmd).context("spawn child")?;
        drop(pair.slave); // riduciamo fd references

        let reader = pair.master.try_clone_reader().context("clone reader")?;
        let writer = pair.master.take_writer().context("take writer")?;

        let (tx, rx) = mpsc::unbounded_channel::<Vec<u8>>();

        // Blocking reader thread — portable-pty è blocking.
        task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() { break; }
                    }
                    Err(e) => {
                        tracing::warn!(?e, "pty read error");
                        break;
                    }
                }
            }
        });

        Ok(PtySession {
            writer: Arc::new(Mutex::new(writer)),
            rx: Arc::new(tokio::sync::Mutex::new(rx)),
            id: uuid::Uuid::new_v4(),
        })
    }

    pub async fn write(&self, bytes: &[u8]) -> Result<()> {
        let writer = self.writer.clone();
        let bytes = bytes.to_vec();
        task::spawn_blocking(move || {
            let mut w = writer.lock().unwrap();
            w.write_all(&bytes).context("pty write")?;
            w.flush().ok();
            Ok::<_, anyhow::Error>(())
        }).await??;
        Ok(())
    }

    pub async fn read_some(&self) -> Result<Vec<u8>> {
        let mut rx = self.rx.lock().await;
        rx.recv().await.context("pty channel closed")
    }
}
```

**Step 3: Esponi modulo in `lib.rs`**

```rust
pub mod pty;
```

**Step 4: Test**

```bash
cargo test -p dazero --test pty -- --nocapture
```
Expected: PASS.

**Step 5: Commit**

```bash
git add crates/dazero
git commit -m "feat(pty): add PtySession wrapper over portable-pty with async IO"
```

---

## Task 8: Bridge WebSocket ↔ PTY su `/ws/pty`

**Files:**
- Modify: `crates/dazero/src/ws.rs` (aggiungi `pty_handler`)
- Modify: `crates/dazero/src/http.rs` (route)
- Test: `crates/dazero/tests/pty_ws.rs`

**Step 1: Test integrazione WS ↔ PTY**

```rust
// crates/dazero/tests/pty_ws.rs
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn ws_pty_shell_echo() {
    let port = find_free_port();
    tokio::spawn(async move { dazero::http::serve(port).await.unwrap(); });

    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let url = format!("ws://127.0.0.1:{port}/ws/pty");
    let (mut ws, _) = connect_async(url).await.expect("connect");

    // Invia un comando alla shell
    ws.send(Message::Binary("echo pty-hello\n".into())).await.unwrap();

    let mut received = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            msg = ws.next() => {
                match msg {
                    Some(Ok(Message::Binary(b))) => {
                        received.extend_from_slice(&b);
                        if String::from_utf8_lossy(&received).contains("pty-hello") { break; }
                    }
                    Some(Ok(_)) => {}
                    _ => break,
                }
            }
        }
    }
    assert!(String::from_utf8_lossy(&received).contains("pty-hello"),
        "expected 'pty-hello' in PTY output, got: {:?}",
        String::from_utf8_lossy(&received));
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}
```

**Step 2: Aggiungi handler in `ws.rs`**

```rust
use crate::pty::PtySession;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;

pub async fn pty_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(pty_socket)
}

async fn pty_socket(socket: WebSocket) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    let sess = match PtySession::spawn_shell(None) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            let _ = ws_tx.send(Message::Text(format!("pty spawn failed: {e}").into())).await;
            return;
        }
    };

    // Task: PTY → WebSocket
    let reader_sess = sess.clone();
    let reader = tokio::spawn(async move {
        loop {
            match reader_sess.read_some().await {
                Ok(chunk) => {
                    if ws_tx.send(Message::Binary(chunk.into())).await.is_err() { break; }
                }
                Err(_) => break,
            }
        }
    });

    // Main: WebSocket → PTY
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Binary(b) => {
                if sess.write(&b).await.is_err() { break; }
            }
            Message::Text(t) => {
                if sess.write(t.as_bytes()).await.is_err() { break; }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    reader.abort();
}
```

**Step 3: Wire in `http.rs`**

```rust
.route("/ws/pty", get(ws::pty_handler))
```

**Step 4: Esegui test**

```bash
cargo test -p dazero --test pty_ws -- --nocapture
```
Expected: PASS.

**Step 5: Commit**

```bash
git add crates/dazero
git commit -m "feat(ws): bridge WebSocket /ws/pty to a real PTY shell"
```

---

## Task 9: xterm.js nella UI connesso a `/ws/pty`

**Files:**
- Create: `ui/src/Terminal.tsx`
- Create: `ui/src/lib/ws.ts`
- Modify: `ui/src/App.tsx`

**Step 1: `ui/src/lib/ws.ts`**

```ts
export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
```

**Step 2: `ui/src/Terminal.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "./lib/ws";

export function Terminal() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#0b0b0f" },
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const ws = new WebSocket(wsUrl("/ws/pty"));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") term.write(ev.data);
      else term.write(new Uint8Array(ev.data));
    };
    ws.onclose = () => term.writeln("\r\n[dazero: connection closed]");
    ws.onerror = () => term.writeln("\r\n[dazero: ws error]");

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
```

**Step 3: Aggiorna `App.tsx`**

```tsx
import { Terminal } from "./Terminal";

export function App() {
  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header style={{ padding: "8px 16px", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between" }}>
        <strong>dazero</strong>
        <span style={{ opacity: 0.6, fontSize: 12 }}>M1 foundations</span>
      </header>
      <section style={{ padding: 12 }}>
        <div style={{ height: "calc(100vh - 60px)", background: "#0b0b0f", border: "1px solid #222", borderRadius: 8, padding: 8 }}>
          <Terminal />
        </div>
      </section>
    </main>
  );
}
```

**Step 4: Dev smoke test end-to-end**

Terminale 1: `cargo run -p dazero -- start --no-open`
Terminale 2: `cd ui && bun run dev`
Apri `http://localhost:5173`. Deve apparire una shell interattiva funzionante. Prova `ls`, `pwd`, `vim README.md` (editor dovrebbe funzionare). Ridimensiona la finestra — il terminale si adatta.

**Step 5: Build production e smoke test integrato**

```bash
cargo run --release -p dazero -- start --port 7000
```
Apri `http://127.0.0.1:7000` — stesso comportamento ma servito dal binario.

**Step 6: Commit**

```bash
git add ui
git commit -m "feat(ui): connect xterm.js to /ws/pty for live shell"
```

---

## Task 10: Package npm stub con pattern `optionalDependencies`

**Files:**
- Create: `npm/dazero/package.json`
- Create: `npm/dazero/bin/dazero.js`
- Create: `npm/dazero/postinstall.js`
- Create: `npm/dazero/README.md`
- Create: `npm/platforms/darwin-arm64/package.json` (template)
- Create: `npm/platforms/darwin-x64/package.json`
- Create: `npm/platforms/linux-x64/package.json`
- Create: `npm/platforms/linux-arm64/package.json`
- Create: `npm/platforms/windows-x64/package.json`

**Nota:** in M1 **non** pubblichiamo ancora su npm — creiamo solo la struttura e verifichiamo che funzioni in locale (`npm pack` + `npm i -g ./dazero-*.tgz`). La pubblicazione effettiva avverrà dalla pipeline di release (Task 12).

**Step 1: `npm/dazero/package.json` (stub principale)**

```json
{
  "name": "dazero",
  "version": "0.1.0",
  "description": "Infinite canvas of real terminals for parallel AI agents",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/andreabuttarelli/dazero.git" },
  "bin": { "dazero": "bin/dazero.js" },
  "files": ["bin/", "postinstall.js", "README.md"],
  "scripts": {
    "postinstall": "node postinstall.js"
  },
  "optionalDependencies": {
    "@dazero/darwin-arm64": "0.1.0",
    "@dazero/darwin-x64": "0.1.0",
    "@dazero/linux-x64": "0.1.0",
    "@dazero/linux-arm64": "0.1.0",
    "@dazero/windows-x64": "0.1.0"
  },
  "engines": { "node": ">=18" }
}
```

**Step 2: `npm/dazero/bin/dazero.js`**

```js
#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { platform, arch } = process;

const map = {
  "darwin-arm64": "@dazero/darwin-arm64",
  "darwin-x64": "@dazero/darwin-x64",
  "linux-x64": "@dazero/linux-x64",
  "linux-arm64": "@dazero/linux-arm64",
  "win32-x64": "@dazero/windows-x64",
};

const key = `${platform}-${arch}`;
const pkgName = map[key];
if (!pkgName) {
  console.error(`dazero: unsupported platform ${key}`);
  process.exit(1);
}

let binPath;
try {
  binPath = require.resolve(`${pkgName}/bin/dazero${platform === "win32" ? ".exe" : ""}`);
} catch {
  console.error(`dazero: the platform package '${pkgName}' is not installed.`);
  console.error("Try: npm i -g dazero --force  (or reinstall)");
  process.exit(1);
}

const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
```

**Step 3: `npm/dazero/postinstall.js`** (no-op per ora, placeholder)

```js
// Placeholder. Il pattern optionalDependencies è auto-sufficiente.
// Qui potremmo in futuro fare `chmod +x` del binario.
```

**Step 4: Per-platform template `npm/platforms/darwin-arm64/package.json`**

```json
{
  "name": "@dazero/darwin-arm64",
  "version": "0.1.0",
  "description": "dazero binary for darwin-arm64",
  "license": "MIT",
  "files": ["bin/"],
  "os": ["darwin"],
  "cpu": ["arm64"]
}
```

Replica con adeguamenti per gli altri 4 target (`os`/`cpu` corretti; per Windows `bin/dazero.exe`).

**Step 5: Smoke test locale**

```bash
# Builda binario host
cargo build --release -p dazero

# Determina la tua piattaforma e popola manualmente il pacchetto per test
HOST_TRIPLE=$(rustc -vV | awk '/host:/ {print $2}')
echo "host: $HOST_TRIPLE"

# Esempio per macOS arm64:
mkdir -p npm/platforms/darwin-arm64/bin
cp target/release/dazero npm/platforms/darwin-arm64/bin/

# Pack stub + platform package
cd npm/platforms/darwin-arm64 && npm pack && cd -
cd npm/dazero && npm pack && cd -

# Install globale dal tarball (in directory temporanea)
TMPDIR=$(mktemp -d)
cp npm/dazero/dazero-*.tgz npm/platforms/darwin-arm64/dazero-darwin-arm64-*.tgz $TMPDIR/
cd $TMPDIR && npm i -g ./dazero-0.1.0.tgz ./dazero-darwin-arm64-0.1.0.tgz

# Invoca
dazero --version
```

Expected: `dazero 0.1.0`.

**Step 6: Commit**

```bash
git add npm
git commit -m "chore(npm): add stub + per-platform package templates"
```

---

## Task 11: CI — `ci.yml` (lint + test)

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: `ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  rust:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: rustfmt, clippy }
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - uses: Swatinem/rust-cache@v2
      - name: Install UI deps
        working-directory: ui
        run: bun install --frozen-lockfile
      - name: fmt
        run: cargo fmt --all -- --check
      - name: clippy
        run: cargo clippy --all-targets -- -D warnings
      - name: test
        run: cargo test --all --locked

  ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - working-directory: ui
        run: bun install --frozen-lockfile && bun run typecheck && bun run build
```

**Step 2: Verifica localmente gli stessi check**

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all --locked
cd ui && bun run typecheck && bun run build
```

Correggi fino a che tutto passa.

**Step 3: Commit e push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + test pipeline for Rust and UI"
git push -u origin main
```

Apri GitHub Actions e verifica che il workflow passi verde.

---

## Task 12: Release pipeline `release.yml` (cross-compile + GH Release + npm publish)

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `scripts/release/populate-platform-packages.sh`

**Step 1: Script di packaging**

```bash
# scripts/release/populate-platform-packages.sh
#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version required, e.g. 0.1.0}"
TARGET="${2:?target required, e.g. aarch64-apple-darwin}"

case "$TARGET" in
  aarch64-apple-darwin)   PKG="darwin-arm64"; EXT="" ;;
  x86_64-apple-darwin)    PKG="darwin-x64";   EXT="" ;;
  x86_64-unknown-linux-gnu) PKG="linux-x64";  EXT="" ;;
  aarch64-unknown-linux-gnu) PKG="linux-arm64"; EXT="" ;;
  x86_64-pc-windows-msvc) PKG="windows-x64";  EXT=".exe" ;;
  *) echo "unknown target $TARGET"; exit 1 ;;
esac

mkdir -p "npm/platforms/$PKG/bin"
cp "target/$TARGET/release/dazero$EXT" "npm/platforms/$PKG/bin/"
# Imposta version nel package.json
node -e "
  const fs=require('fs');
  const p='npm/platforms/$PKG/package.json';
  const j=JSON.parse(fs.readFileSync(p));
  j.version='$VERSION';
  fs.writeFileSync(p, JSON.stringify(j,null,2));
"
echo "populated npm/platforms/$PKG"
```

`chmod +x scripts/release/populate-platform-packages.sh`.

**Step 2: `release.yml`**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  build:
    name: Build ${{ matrix.target }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: macos-latest,   target: aarch64-apple-darwin }
          - { os: macos-latest,   target: x86_64-apple-darwin }
          - { os: ubuntu-latest,  target: x86_64-unknown-linux-gnu }
          - { os: ubuntu-latest,  target: aarch64-unknown-linux-gnu, use_cross: true }
          - { os: windows-latest, target: x86_64-pc-windows-msvc }
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: ${{ matrix.target }} }
      - uses: oven-sh/setup-bun@v2
      - uses: Swatinem/rust-cache@v2
      - name: UI build
        working-directory: ui
        run: bun install --frozen-lockfile && bun run build
      - name: Install cross
        if: matrix.use_cross
        run: cargo install cross --locked
      - name: Build
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          if [ "${{ matrix.use_cross }}" = "true" ]; then
            cross build --release --target ${{ matrix.target }} -p dazero
          else
            cargo build --release --target ${{ matrix.target }} -p dazero
          fi
      - name: Populate platform package
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          ./scripts/release/populate-platform-packages.sh "$VERSION" "${{ matrix.target }}"
      - uses: actions/upload-artifact@v4
        with:
          name: platform-${{ matrix.target }}
          path: npm/platforms/

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { path: artifacts }
      - name: Merge artifacts into npm/platforms
        run: |
          mkdir -p npm/platforms
          cp -r artifacts/platform-*/* npm/platforms/ || true
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          registry-url: "https://registry.npmjs.org"
      - name: Set stub version
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          node -e "
            const fs=require('fs');
            const p='npm/dazero/package.json';
            const j=JSON.parse(fs.readFileSync(p));
            j.version='$VERSION';
            for (const k of Object.keys(j.optionalDependencies)) j.optionalDependencies[k]='$VERSION';
            fs.writeFileSync(p, JSON.stringify(j,null,2));
          "
      - name: Publish platform packages
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for d in npm/platforms/*; do
            (cd "$d" && npm publish --access public --provenance)
          done
      - name: Publish stub
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: cd npm/dazero && npm publish --access public --provenance
      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            npm/platforms/*/bin/dazero*
```

**Step 3: Configura il secret `NPM_TOKEN`**

L'utente deve creare un token con `Automation` + `Publish` e aggiungerlo come secret:
```bash
gh secret set NPM_TOKEN
```
E creare l'organizzazione npm `@dazero` e il pacchetto `dazero` (o fare `npm access` grant dopo la prima publish). Documenta questo nel README.

**Step 4: Dry-run locale (senza push del tag)**

```bash
# Verifica che il Bash script funzioni su host
./scripts/release/populate-platform-packages.sh 0.1.0 $(rustc -vV | awk '/host:/ {print $2}')
```

**Step 5: Commit**

```bash
git add .github/workflows/release.yml scripts/release
git commit -m "ci: add cross-compile release pipeline and npm publishing"
```

---

## Task 13: README iniziale

**Files:**
- Modify: `README.md`

**Step 1: Scrivi README minimal**

```markdown
# dazero

> Infinite canvas of real terminals for parallel AI agents.

**Status:** pre-alpha (Milestone 1 — foundations).

## Quick start

```bash
npx dazero start
```

Your browser opens at `http://127.0.0.1:7000` with a live shell.

## Install (persistent)

```bash
npm i -g dazero
# or
bun i -g dazero
```

## Development

Requires: Rust 1.80+, bun, tmux (for M3+).

```bash
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero

# Terminal 1 — daemon
cargo run -p dazero -- start --no-open

# Terminal 2 — UI with HMR
cd ui && bun install && bun run dev
```

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: bootstrap README with quick start and dev instructions"
```

---

## Task 14: Verifica finale M1 — checklist di accettazione

**Step 1: Esegui ognuno di questi controlli manualmente**

- [ ] `cargo fmt --all -- --check` → exit 0
- [ ] `cargo clippy --all-targets -- -D warnings` → exit 0
- [ ] `cargo test --all --locked` → tutti i test PASS
- [ ] `cd ui && bun run typecheck && bun run build` → exit 0
- [ ] `cargo run --release -p dazero -- start --port 7000` apre il browser su `http://127.0.0.1:7000` e mostra una shell funzionante
- [ ] Nel browser la shell accetta input e mostra output (`ls`, `pwd`, `vim`, tasti freccia, cursore lampeggiante)
- [ ] Ridimensionando la finestra, il terminale si adatta (testare `htop`: l'UI deve riflettere la dimensione corretta)
- [ ] Chiudere la tab e riconnettersi: nuova sessione PTY (in M1 non c'è persistenza tmux)
- [ ] GitHub Actions `CI` verde su push a `main`

**Step 2: Se tutto verde, crea tag e triggera release**

```bash
git tag v0.1.0
git push origin v0.1.0
```

Attendi che `release.yml` completi e verifica:
- [ ] GitHub Release creata con assets
- [ ] `npm view dazero` mostra 0.1.0 pubblicato
- [ ] `npx dazero@0.1.0 start` da una macchina pulita funziona

**Step 3: Post-mortem breve**

Se qualcosa ha richiesto workaround o ha rivelato un'assunzione errata, aggiungi una nota di 2-3 righe in fondo a questo file nella sezione **"Lessons learned from M1"** (creala). Queste note guidano il plan di M2.

---

## Appendice A — Debug tips

- **PTY non fa echo**: verifica che `TERM` sia settato nel `CommandBuilder`. Senza, molte shell disabilitano features.
- **xterm si disconnette dopo pochi secondi**: browser moderni killano WS idle dopo 60s senza traffico. Considera ping/pong in M2.
- **`bun run build` lento in hot loop Rust**: il `build.rs` salta la build se `dist` esiste in profile `dev`. Forza rebuild con `rm -rf ui/dist && cargo build`.
- **"port 7000 in use"**: `lsof -i :7000` e `kill` del processo vecchio. In M2 aggiungere fallback auto.

## Appendice B — Skills da usare durante l'esecuzione

- `@superpowers:test-driven-development` per ogni task: test fail → impl minimale → test pass → commit.
- `@superpowers:verification-before-completion` prima di marcare completo ogni task: eseguire davvero i comandi, non assumerli.
- `@superpowers:systematic-debugging` se un test fallisce e la causa non è ovvia.
- `@superpowers:requesting-code-review` al termine di Task 14 prima del tag di release.
