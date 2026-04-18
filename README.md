# dazero

> **Un canvas infinito di terminali veri per orchestrare agenti AI in parallelo.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-pre--alpha%20(M1)-orange)](#roadmap)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)](#installazione)

Dazero è un tool open source che trasforma il tuo computer in una plancia di comando per più agenti AI (Claude Code, Codex, Gemini CLI, opencode, Kimi Code, e altri) che lavorano **insieme** sullo stesso progetto. Invece di una singola chat con un'unica AI, hai un **canvas zoomabile** dove ogni nodo è un terminale vero della tua macchina, e puoi mettere un agente diverso in ognuno. Gli agenti possono parlare tra loro, delegarsi task, e tu vedi tutto succedere in tempo reale.

---

## Indice

- [Perché dazero?](#perché-dazero)
- [Cosa vedrai](#cosa-vedrai)
- [Caratteristiche principali](#caratteristiche-principali)
- [Installazione](#installazione)
- [Primi passi](#primi-passi)
- [Come funziona](#come-funziona-sotto-il-cofano)
- [Requisiti di sistema](#requisiti-di-sistema)
- [Roadmap](#roadmap)
- [Sviluppo e contributi](#sviluppo-e-contributi)
- [FAQ](#faq)
- [Licenza](#licenza)

---

## Perché dazero?

Se ti è mai capitato di avere **più tab di terminale aperte con agenti AI diversi** — uno che scrive codice, uno che corregge test, uno che aggiorna la documentazione — sai già il problema: cambiare tab manualmente, copiare output tra una chat e l'altra, perdere il filo di quale agente sta facendo cosa.

**Dazero risolve questo con tre scelte di design precise:**

1. **Gli agenti vivono dentro terminali veri del tuo computer.** Non è un proxy, non è un wrapper. Sono esattamente gli stessi `claude-code`, `codex`, `gemini` che lanci dalla riga di comando. Usi le **tue subscription**, le **tue API key**, la **tua config** — dazero non si interpone e non vede i tuoi token.
2. **Un canvas infinito li tiene tutti a vista.** Trascini, zoommi, crei frecce visibili tra un agente e l'altro, aggiungi note Markdown e liste di task nello stesso spazio. È la differenza tra 15 tab di Chrome e una lavagna di Figma.
3. **Gli agenti possono collaborare.** Un agente può creare una lista di sotto-task e assegnarle a nuovi agenti che vengono spawnati automaticamente. Le frecce nel canvas mostrano chi ha delegato cosa a chi.

**Nessun account dazero. Nessun cloud. Nessuna telemetria.** È un singolo binario che gira sul tuo PC, parla con il browser in locale, e basta.

---

## Cosa vedrai

> **Nota:** screenshot e GIF verranno aggiunti quando la M2 (canvas) sarà completata. Per ora M1 espone un singolo terminale live come proof-of-concept.

Dopo `npx dazero start`:

- Il browser di default apre `http://localhost:7000`.
- Una plancia nera con griglia: il **canvas**.
- Bottone "+ Nuovo progetto": crei un progetto scegliendo una cartella o incollando l'URL di una repo GitHub (verrà clonata localmente).
- Dentro il progetto: trascini un nodo **Terminale**, scegli `claude-code` (o qualsiasi altro preset), e parte una shell reale in quella cartella con l'agente pronto.
- Trascini un nodo **Task-List**, scrivi 3 cose da fare, clicchi "Esegui tutte" → si aprono 3 terminali affiancati, uno per task, ognuno con l'agente che hai scelto.
- Mentre gli agenti lavorano, vedi le frecce crescere: ogni agente che decide di delegare appare collegato al proprio figlio nel canvas.

---

## Caratteristiche principali

### Disponibili oggi (M1 — pre-alpha)
- ✅ Binario singolo distribuito via `npx dazero` (cross-platform)
- ✅ UI React servita localmente su `http://localhost:7000`
- ✅ Terminale interattivo vero (PTY) nel browser via xterm.js
- ✅ Apertura automatica del browser al lancio
- ✅ Open source MIT, zero telemetria

### In arrivo
- 🟡 **M2** — Canvas infinito React Flow, dashboard progetti, clone da URL GitHub
- 🟡 **M3** — Task-list con spawn multiplo di agenti, sessioni tmux detached (gli agenti sopravvivono alla chiusura)
- 🟡 **M4** — MCP server locale: gli agenti possono creare task, delegare ad altri agenti, leggere lo stato del canvas
- 🟡 **M5** — Note Markdown nel canvas, switcher progetti `cmd+P`, Homebrew cask, release firmate

Vedi la [roadmap completa](#roadmap) per dettagli.

---

## Installazione

### Il modo rapido (consigliato)

Se hai **Node.js** e **bun** o **npm** installati:

```bash
npx dazero start
```

Fine. Il browser si apre da solo. `npx` scarica ed esegue il binario corretto per il tuo sistema, senza installazione permanente.

Se preferisci un'installazione persistente:

```bash
# con bun (raccomandato, più veloce)
bun i -g dazero
dazero start

# o con npm
npm i -g dazero
dazero start
```

### Se non hai Node o bun

Node.js è richiesto perché la distribuzione primaria è via npm (il binario è comunque scritto in Rust). Installalo così:

**macOS:**
```bash
brew install bun        # copre tutto (bun include un runtime Node-compatibile)
```

**Linux / Windows:**
- Node: scarica da [nodejs.org](https://nodejs.org) (LTS).
- Bun: `curl -fsSL https://bun.sh/install | bash`.

Poi torna al **modo rapido** sopra.

### Altri canali

- **Homebrew (in arrivo con M5):** `brew install dazero`
- **Cargo (per Rustacean):** `cargo install dazero`
- **GitHub Releases:** download diretto di `.tar.gz` / `.zip` dalla [pagina Releases](https://github.com/andreabuttarelli/dazero/releases)

---

## Primi passi

1. **Avvia dazero:**
   ```bash
   npx dazero start
   ```
   Il browser apre `http://localhost:7000` automaticamente. Se non succede, aprilo a mano.

2. **In M1** (stato attuale): vedrai un terminale live nella UI. Scrivi `ls`, `pwd`, o qualunque comando — è una shell vera della tua macchina dentro al browser.

3. **Quando arriverà M2+:** cliccherai "+ Nuovo progetto", sceglierai una cartella o una repo, e potrai creare nodi terminale, task-list e note nel canvas. Ogni nodo terminale può ospitare un agente AI diverso.

4. **Per chiudere:** chiudi la tab del browser. In M1 questo uccide anche i terminali (sono effimeri); in M3 le sessioni tmux detached li terranno vivi tra le sessioni.

---

## Come funziona (sotto il cofano)

Dazero è un **singolo binario Rust** che all'avvio fa tre cose:

```
 Il tuo browser (Chrome/Arc/Safari/Firefox)
        │  ← naviga http://localhost:7000
        ▼
 ┌──────────────────── binario dazero (Rust) ────────────────────┐
 │                                                               │
 │  Server HTTP+WebSocket   ←→   Gestione PTY/tmux               │
 │  (serve UI + eventi)          (terminali veri del tuo PC)     │
 │          ↑                                                    │
 │          │              UI React embedded nel binario         │
 │          │              (servita staticamente)                │
 │          │                                                    │
 │     MCP server locale ← tool strutturati per agenti AI        │
 │     (~/.dazero/mcp.sock)                                      │
 └───────────────────────────────────────────────────────────────┘
```

**Punti chiave del design:**

- **Niente Electron, niente webview nativi.** Dazero usa il browser che già hai. Questo significa bundle leggerissimo, nessuna firma Apple richiesta per iniziare, e come bonus puoi accedere a dazero da remoto via SSH tunnel (`ssh -L 7000:localhost:7000 <server>`) — pratico se hai una workstation potente in ufficio e un laptop in viaggio.
- **Gli agenti sono processi separati.** Dazero spawna `claude-code`, `codex`, o qualsiasi tu scelga in una sessione tmux detached (da M3) — e cattura i byte del PTY per mostrarli in xterm.js nel browser. Quando scrivi nel terminale del browser, i byte tornano indietro nella stessa PTY. È un terminale reale in tutti i sensi: funziona `vim`, `htop`, autocompletion zsh, tutto.
- **Gli agenti parlano al canvas via MCP.** Da M4 in poi, ogni agente compatibile con MCP (Claude Code, Codex, Gemini CLI nativamente) potrà chiamare tool come `spawn_agent`, `create_task`, `update_task_status` — e dazero trasforma questi in nuovi nodi, frecce, stati sul canvas.

**Design doc completo:** [`docs/plans/2026-04-18-dazero-design.md`](./docs/plans/2026-04-18-dazero-design.md).

---

## Requisiti di sistema

**Utente finale** (solo per usare `npx dazero`): Node 18+, bun o npm, una shell POSIX (bash/zsh/fish) o PowerShell. Tmux arriverà come dipendenza opzionale da M3.

**Sviluppatori** (per contribuire al codice): Rust 1.83, bun 1.2+, git, gh, tmux, Node 18+.

Lista completa con versioni, link e script di setup one-shot: **[REQUIREMENTS.md](./REQUIREMENTS.md)**.

---

## Roadmap

Dazero viene costruito incrementalmente in 5 milestone. Ogni milestone è un MVP rilasciabile a sé.

| Milestone | Obiettivo | Stato |
|-----------|-----------|-------|
| **M1 Foundations** | `npx dazero start` apre una shell vera nel browser. Daemon Rust + UI React + bridge WS↔PTY + packaging npm cross-platform. | 🟢 **in corso** |
| **M2 Canvas & Projects** | Canvas infinito React Flow, dashboard progetti con sidebar, wizard "+ New project" con clone GitHub, persistenza SQLite. | ⚪ pianificato |
| **M3 Multi-agent & Task-list** | Preset agent-type (Claude Code, Codex, Gemini CLI, opencode, custom), nodo Task-List con spawn parallelo, sessioni tmux detached (persistenza), edge parent→child. | ⚪ pianificato |
| **M4 MCP & Orchestration** | MCP server locale con ~10 tool, gli agenti possono creare/delegare task, context bundle esplicito, budget cap configurabile. | ⚪ pianificato |
| **M5 Polish & Release** | Note Markdown nel canvas, `cmd+P` switcher, Homebrew cask, Apple code signing + notarization, sito docs. | ⚪ pianificato |

Piano dettagliato M1: [`docs/plans/2026-04-18-dazero-m1-foundations.md`](./docs/plans/2026-04-18-dazero-m1-foundations.md).

---

## Sviluppo e contributi

### Setup locale

```bash
# Installa prerequisiti (macOS)
brew install node bun gh tmux git
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.83
. "$HOME/.cargo/env"

# Clona e prepara
git clone https://github.com/andreabuttarelli/dazero.git
cd dazero

# Dipendenze UI
cd ui && bun install && cd -

# Prima build (scarica crate Rust, ~2-3 min)
cargo build
```

Setup completo per Linux/Windows e verifica versioni: vedi [REQUIREMENTS.md](./REQUIREMENTS.md).

### Workflow di sviluppo con hot-reload

```bash
# Terminale 1 — daemon Rust
cargo run -p dazero -- start --no-open

# Terminale 2 — UI Vite in modalità dev (HMR)
cd ui && bun run dev

# Apri http://localhost:5173 (vite dev proxy delle chiamate API al daemon)
```

### Test

```bash
cargo test --all --locked      # Rust (unit + integration)
cd ui && bun run typecheck     # TypeScript strict
cd ui && bun run build         # UI prod build smoke
```

### Convenzioni

- **Commit:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- **PR:** un commit-per-task secondo l'implementation plan, CI deve passare (fmt, clippy strict, test).
- **Linguaggio commit/PR:** inglese. Linguaggio design doc/README: italiano è accettato per ora (il progetto è nato in italiano), ma la transizione a inglese è un goal di M5.

### Contribuire

Issue, discussioni, e PR sono benvenuti. Prima di aprire una PR grossa:
1. Apri una issue per proporre il cambio.
2. Leggi il [design doc](./docs/plans/2026-04-18-dazero-design.md) per capire i vincoli architetturali.
3. Segui il plan di milestone corrente se stai contribuendo a M2/M3/M4/M5.

Per cambiamenti piccoli (fix typo, refactor locale, docs), PR diretta va bene.

---

## FAQ

**È pronto per essere usato?**
No — siamo in **pre-alpha (M1)**. In M1 c'è solo un singolo terminale nel browser. Il canvas, i task, gli agenti arriveranno con M2-M4. Puoi installare per dare un'occhiata e seguire lo sviluppo, ma aspetta M3 per un uso quotidiano.

**Come gestisce le API key degli agenti?**
**Non le gestisce.** Questo è il design chiave: dazero lancia `claude-code`, `codex`, `gemini` come sottoprocessi che leggono la loro config (`~/.claude/`, `~/.codex/`, `~/.config/gemini/...`) esattamente come quando li lanci dalla shell. Dazero non vede i token, non fa proxy delle chiamate, non sincronizza nulla nel cloud.

**Posso usare agenti AI self-hosted?**
Sì — qualsiasi CLI che gira in una shell funziona. In M3 puoi definire un preset "custom" con qualsiasi comando (es. `ollama run llama3.1`, `aider --model local`, qualunque cosa tu voglia).

**Funziona su Windows?**
Sì, ma M1 è testato prioritariamente su macOS e Linux. Windows è supportato dal pacchetto `@dazero/windows-x64`. Tmux su Windows richiede WSL (è un prerequisito da M3).

**Che differenza con Warp, Hyper, Wave Terminal?**
Quelli sono **terminali con AI integrato**. Dazero è un **canvas di orchestrazione** che usa gli agenti AI esistenti in terminali veri. Se ami un terminale specifico, continui a usarlo per la shell quotidiana — dazero serve solo quando vuoi più agenti coordinati su un progetto.

**Posso accedere a dazero da remoto?**
Sì, con SSH port forwarding:
```bash
ssh -L 7000:localhost:7000 workstation-potente
# Sulla workstation remota
npx dazero start --no-open
# Sul laptop locale apri http://localhost:7000
```
Il calcolo pesante (agenti, build, test) gira sulla workstation, il browser locale è solo un frontend.

**Il repo si chiama "dazero" — significa?**
"Da zero" in italiano = "from scratch". È il nome in codice iniziale e potrebbe essere rinominato prima di M5.

---

## Licenza

[MIT](./LICENSE) — usalo, fork, modifica, rivendi. Zero vincoli oltre al preservare il copyright.

---

## Crediti

Costruito con [Rust](https://www.rust-lang.org/), [axum](https://github.com/tokio-rs/axum), [portable-pty](https://github.com/wez/wezterm/tree/main/pty), [React](https://react.dev/), [React Flow](https://reactflow.dev/), [xterm.js](https://xtermjs.org/), [Vite](https://vitejs.dev/), [bun](https://bun.sh/).

Ispirato da Figma/tldraw (canvas UX), VS Code/Warp (terminal UX), tmux (persistenza), e dall'ecosistema CLI-first alla Jupyter/OpenWebUI/Supabase.
