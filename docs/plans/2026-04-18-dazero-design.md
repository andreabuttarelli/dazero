# Dazero — Design Document

**Data:** 2026-04-18
**Autore:** Andrea Buttarelli
**Stato:** Approvato (brainstorming sessione 1)

---

## 1. Contesto e obiettivi

**Dazero** è un tool desktop open source per macOS (cross-platform Linux/Windows gratis) che fornisce un **canvas infinito a nodi** dove i nodi sono **terminali reali del computer**, **note Markdown** e **task-list**. L'obiettivo ultimo è orchestrare **più agenti AI in parallelo** (Claude Code, Codex, Gemini CLI, opencode, Kimi, shell plain, custom) ciascuno dentro un terminale vero della macchina dell'utente, così che l'utente sfrutti le proprie subscription ai provider senza auth intermedie.

**Principi guida:**
- **Zero auth, zero cloud** — tutto locale, nessun account dazero.
- **Piggyback su tool esistenti** (`gh`, `tmux`, CLI agenti) invece di reimplementarli.
- **Agenti vivono in terminali reali** per eredità diretta di subscription/config utente.
- **Distribuzione senza frizione** via `npx dazero`.

**Non-goals (fase 1):**
- Sincronizzazione cloud/multi-device.
- Sandbox custom sopra quella degli agenti.
- Mac App Store (incompatibile con PTY arbitrari).

---

## 2. Architettura high-level

Dazero è un **singolo binario Rust** (`dazero`) che espone:
1. **HTTP + WebSocket server** su `localhost:7000` (UI + stream PTY + eventi canvas).
2. **MCP server locale** su socket Unix `~/.dazero/mcp.sock` (tool strutturati per agenti).
3. **CLI helper** (subcommands `start|stop|spawn|task|project|...`) per agenti/utenti che non usano MCP.

La **UI** è React + React Flow, buildata come asset statici e **embeddata nel binario** via `rust-embed`. Lanciare `npx dazero` avvia il daemon e apre automaticamente `http://localhost:7000` nel browser di default.

Gli **agenti esterni** girano dentro **sessioni tmux detached** (`tmux new-session -d -s dazero-<uuid>`) gestite dal daemon, così sopravvivono alla chiusura dell'app. Il daemon cattura l'output PTY e lo stream via WebSocket alla UI (xterm.js), e inietta input dell'utente nella direzione opposta.

```
┌─────────────────────────── dazero daemon (Rust) ───────────────────────────┐
│   HTTP+WS server (:7000)  ←→  Canvas store (SQLite)  ←→  PTY/tmux manager  │
│         ↑                             ↑                         ↑          │
│    UI assets embedded          MCP server (socket)        Agent spawner    │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
              Browser (Chrome/Arc/Safari) ← utente via `npx dazero`
```

---

## 3. Componenti

### 3.1 Daemon Rust (`crates/dazero/`)

| Modulo | Responsabilità |
|--------|----------------|
| `http` | axum server su `:7000`, REST + WebSocket per PTY streams ed eventi canvas |
| `db` | SQLite via `rusqlite`, file `~/.dazero/dazero.db`, migrazioni `refinery` |
| `pty` | Wrapper su `portable-pty`: spawn, read/write async, resize. Un task tokio per PTY. |
| `tmux` | Lifecycle sessioni detached (`new -d`, `attach`, `kill`, `list`, `capture-pane`) |
| `mcp` | MCP server (stdio + socket Unix), espone ~10 tool strutturati |
| `agents` | Registry preset (claude-code, codex, gemini, opencode, shell, custom), budget cap spawn |
| `project` | CRUD progetti, `git clone`, risoluzione cwd, integrazione `gh` CLI quando disponibile |
| `cli` | Subcommands `dazero start|stop|spawn|task|project|ps|logs` |
| `ui_assets` | `rust-embed` del frontend buildato |

**Dipendenze chiave Rust:** `axum`, `tokio`, `rusqlite`, `portable-pty`, `rust-embed`, `refinery`, `serde`, `uuid`, `anyhow`, `tracing`.

### 3.2 UI React (`ui/`)

| Modulo | Responsabilità |
|--------|----------------|
| `App` | React Router, dashboard ↔ canvas view |
| `Dashboard` | Sidebar progetti, "Recents", wizard "+ New project" (clone/select/URL) |
| `CanvasView` | React Flow provider, zoom/pan, minimap, controls, cmd+P fuzzy finder |
| `nodes/TerminalNode` | xterm.js mounted in `useEffect`, WebSocket bidirezionale |
| `nodes/NoteNode` | Editor Markdown (tiptap o CodeMirror), autosave debounced |
| `nodes/TaskListNode` | Checklist, dropdown agent-type per task, "Run all"/"Run selected" |
| `edges/AgentEdge` | Freccia custom con label (parent→child, task→agent) |
| `lib/wsClient` | WebSocket manager con reconnect, subscribe per nodo |
| `lib/api` | REST client tipizzato generato da OpenAPI spec del daemon |
| `store` | Zustand per stato client (selezione, viewport, filtri) |

**Dipendenze chiave JS:** `react`, `reactflow`, `@xterm/xterm`, `@xterm/addon-fit`, `zustand`, `@tiptap/react`, `vite`, `typescript`.

---

## 4. Data flow

### 4.1 Spawn di un agente (flusso utente)

1. Utente in una `TaskListNode` sceglie agent-type `claude-code` per una task e clicca "Run".
2. UI chiama `POST /api/agents/spawn` con `{project_id, task_id, agent_type, prompt, cwd}`.
3. Daemon:
   - Verifica budget cap (default 5 paralleli). Se superato, coda.
   - Crea riga in `agents` con stato `starting`.
   - Lancia `tmux new-session -d -s dazero-<agent_uuid> -c <cwd>`.
   - Invia comando `echo "$PROMPT" | claude-code` (o comando custom del preset) alla sessione.
   - Spawna task tokio che legge `capture-pane` deltas e li broadcast sul WebSocket `ws://localhost:7000/ws/agents/<id>`.
4. UI riceve evento `agent.started`, crea `TerminalNode` nel canvas collegato alla task via `AgentEdge`.
5. xterm.js si connette al WebSocket e inizia a renderizzare l'output.

### 4.2 Agente che spawna subtask (flusso MCP)

1. Claude Code in T1 chiama MCP tool `create_task_list(parent_agent_id=T1, tasks=[...])`.
2. MCP server riceve, valida, persiste le task, broadcasta `canvas.task_list.created` sulla WebSocket.
3. UI riceve evento, crea `TaskListNode` nel canvas con edge da T1.
4. Claude Code poi chiama `spawn_agent(task_id, agent_type, prompt, context_files, context_note)`.
5. Daemon verifica budget cap, risolve `context_files` (legge dal filesystem, crea temp file con bundle), spawna tmux come in 4.1.
6. UI crea nuovo `TerminalNode` collegato via `AgentEdge` alla task → all'agente parent.

### 4.3 Input utente a terminale

1. Utente digita dentro xterm.js di un `TerminalNode`.
2. Bytes inviati via WebSocket al daemon.
3. Daemon scrive direttamente sul PTY master della sessione tmux corrispondente.
4. Output catturato e broadcast come in 4.1.

### 4.4 Chiusura e riapertura dell'app

1. Utente chiude tab browser / `dazero stop`.
2. Daemon salva viewport e stato UI in SQLite, poi termina.
3. Sessioni tmux **restano attive** (detached).
4. Al prossimo `dazero start`, daemon ri-attacca tutte le sessioni tmux trovate con prefix `dazero-`, ricostruisce gli `agents` con stato `running`, ripristina viewport e nodi canvas.

---

## 5. Persistenza — schema SQLite

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,          -- uuid
  name TEXT NOT NULL,
  path TEXT NOT NULL,           -- cwd assoluto
  git_remote TEXT,              -- https://github.com/user/repo o null
  created_at INTEGER NOT NULL,
  last_opened_at INTEGER
);

CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewport_x REAL DEFAULT 0,
  viewport_y REAL DEFAULT 0,
  viewport_zoom REAL DEFAULT 1
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'terminal' | 'note' | 'task_list'
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL, height REAL,
  data JSON NOT NULL,           -- payload type-specific
  created_at INTEGER NOT NULL
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  kind TEXT,                    -- 'parent_child' | 'task_agent' | 'manual'
  label TEXT
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,     -- 'claude-code' | 'codex' | ... | 'custom'
  tmux_session TEXT NOT NULL,   -- 'dazero-<uuid>'
  status TEXT NOT NULL,         -- 'starting' | 'running' | 'done' | 'failed'
  parent_agent_id TEXT REFERENCES agents(id),
  task_id TEXT REFERENCES tasks(id),
  started_at INTEGER,
  ended_at INTEGER
);

CREATE TABLE task_lists (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  parent_agent_id TEXT REFERENCES agents(id)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  task_list_id TEXT NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL,         -- 'pending' | 'running' | 'done' | 'failed'
  agent_type TEXT,              -- preferenza per spawn
  spawned_agent_id TEXT REFERENCES agents(id),
  position INTEGER NOT NULL     -- ordine nella lista
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSON NOT NULL
);
```

---

## 6. MCP server — tool surface

Esposto via stdio (per agenti che supportano MCP nativamente) e via socket Unix per introspection.

| Tool | Input | Effetto |
|------|-------|---------|
| `create_task_list(parent_agent_id?, tasks[])` | parent id + array di descrizioni | Nuovo nodo TaskList nel canvas |
| `create_task(list_id, description, agent_type?)` | | Aggiunge task |
| `update_task_status(task_id, status)` | `pending|running|done|failed` | Aggiorna DB + broadcast UI |
| `spawn_agent(agent_type, task_id?, prompt, context_files?, context_note?)` | | Spawna tmux + TerminalNode |
| `wait_for_tasks(task_ids[])` | | Bloccante finché tutte in `done|failed` |
| `get_task_status(task_id)` | | Ritorna status |
| `read_agent_output(agent_id, last_n_lines)` | | Ritorna slice scrollback PTY |
| `send_to_agent(agent_id, input)` | | Scrive su PTY master |
| `create_note(content, position?)` | | Nuovo NoteNode |
| `list_canvas()` | | Dump stato canvas corrente |

Lo stesso set è esposto come subcommand CLI: `dazero task create`, `dazero spawn`, `dazero note create`, ecc.

---

## 7. Distribuzione

### 7.1 Pacchetti

- **npm primario**: `dazero` (stub JS) + `@dazero/<platform>-<arch>` (binario). Pattern `optionalDependencies`.
  - Piattaforme supportate: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `windows-x64`.
- **Homebrew cask**: fase 2, tap custom iniziale.
- **Cargo**: `cargo install dazero` (bonus, per Rustacean).
- **GitHub Releases**: `.tar.gz` + `.zip` direct download.

### 7.2 Invocazioni utente

- `npx dazero` — zero install permanente.
- `bunx dazero` — equivalente bun.
- `npm i -g dazero` / `bun i -g dazero` — install persistente, poi `dazero start`.

### 7.3 Pipeline CI

- GitHub Actions su tag `v*`: cross-compile Rust (5 target), genera `.tar.gz` per piattaforma, crea GitHub Release, pubblica 6 pacchetti npm (stub + 5 platform).
- Reference di pattern: `biomejs/biome`, `swc-project/swc`, `evanw/esbuild`.

### 7.4 Code signing (macOS)

- **Fase 1:** ad-hoc signing (utente fa `xattr -dr com.apple.quarantine` o click-destro → Apri). Accettabile per audience developer.
- **Fase 2:** Apple Developer ID + notarization ($99/anno) quando il progetto attira adozione.

---

## 8. Error handling

| Scenario | Strategia |
|----------|-----------|
| PTY crash | Daemon marca agent `failed`, chiude WebSocket con reason, UI mostra toast + nodo in stato errore con bottone "Restart" |
| Tmux non installato | Check all'avvio del daemon, blocca con messaggio chiaro + link a `brew install tmux` |
| MCP tool call invalida (schema mismatch) | Ritorna errore strutturato JSON-RPC, loggato ma non killa l'agente |
| `git clone` fallisce (repo privato, rete, auth) | Errore user-visible nella dashboard, suggerisce di usare `gh auth login` o selezionare cartella locale |
| Budget cap raggiunto | `spawn_agent` ritorna errore `"budget_exceeded"`; in UI la task va in stato `queued`, viene spawnata appena un altro agente completa |
| Daemon port 7000 occupata | Fallback a 7001..7010, warning loggato; la UI riceve la porta via `dazero start` stdout |
| WebSocket disconnesso | UI reconnect automatico con backoff esponenziale (1s, 2s, 4s, max 30s), stato preservato lato daemon |
| Agente bloccato (nessun output per X min) | Heartbeat PTY via `tmux display-message`; se inattività > soglia (default 15 min), UI mostra warning ma non killa |
| SQLite locked / corrupted | WAL mode abilitato; in caso di corruzione irreversibile, snapshot `.db` rinominato `.db.corrupt-<timestamp>` e nuovo DB inizializzato |

---

## 9. Testing strategy

- **Unit tests Rust** (`cargo test`): modulo `pty`, `tmux`, `agents` (spawn logic + budget cap), `project` (clone + cwd), `mcp` (tool schemas).
- **Integration tests Rust** (`tests/`): avvia daemon su porta random, esercita REST + WebSocket + MCP end-to-end con agent-type `shell` fittizio.
- **E2E tests** (Playwright): lancia daemon, apre browser, verifica flow "crea progetto → crea task-list → spawna shell agent → task done". 3-5 scenari chiave.
- **UI unit tests** (vitest + testing-library): componenti nodo, edge rendering, wsClient reconnect.
- **CI matrix**: cargo test su darwin-arm64 + linux-x64 runners GitHub Actions. E2E solo linux-x64 per velocità.

---

## 10. Decisioni architetturali chiave (riassunto)

| Area | Decisione |
|------|-----------|
| Scope MVP | Tutto: canvas + terminali + note + task-list + spawn agenti (opzione C) |
| Stack | **CLI-first Rust daemon + web UI servita localmente** (non Tauri). UI: React + React Flow + TypeScript + Vite |
| Agente↔canvas | MCP server locale **+** CLI helper `dazero` (entrambi) |
| Persistenza terminali | tmux detached sessions |
| Canvas library | React Flow (frecce visibili per relazioni parent↔child) |
| Package manager | bun (cross-compatibile con npm/pnpm) |
| Distribuzione | `npx dazero` primario, Homebrew/Cargo fase 2 |
| Agent types | Preset built-in + campo custom command (salvabile come nuovo preset) |
| Sandbox | Nessuna aggiuntiva: eredita safety degli agenti sottostanti |
| Task-list | Nodo unico con checklist interna (scalabile) |
| Budget agenti | Cap configurabile, default 5 paralleli |
| Context passing | Bundle esplicito gestito dall'agente parent (file + note) |
| DB | SQLite embedded, WAL mode |
| Progetti | Clone da URL + selezione cartella + info live via `gh` CLI |
| Multi-canvas | 1 canvas per progetto, cmd+P per switch |
| Code signing | Ad-hoc fase 1, Apple Developer ID fase 2 |

---

## 11. Open questions / future work

- **Shortcut globali macOS** (es. cmd+shift+D per aprire dazero da qualsiasi app): richiederebbe wrapper nativo o Tauri opzionale fase 2.
- **Condivisione canvas** (snapshot esportabile per review async): JSON export + viewer web-only (read-only).
- **Plugin system** per agent-type custom via WASM o sottoprocesso con manifest.
- **Telemetria opt-in** (Sentry self-hosted o PostHog) — default off, decisione rimandata.
- **Mobile companion** (view read-only task status da iPhone): richiederebbe tunnel tipo ngrok, non prioritario.
- **Replay / time-travel** delle sessioni agente: registra PTY output con timestamps, replay in UI — nice-to-have fase 2.

---

## 12. Struttura repo attesa

```
dazero/
├── Cargo.toml                    # workspace Rust
├── crates/
│   └── dazero/                   # main binary
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs
│           ├── http/
│           ├── db/
│           ├── pty/
│           ├── tmux/
│           ├── mcp/
│           ├── agents/
│           ├── project/
│           ├── cli/
│           └── ui_assets.rs
├── ui/                           # frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── App.tsx
│       ├── Dashboard/
│       ├── CanvasView/
│       ├── nodes/
│       ├── edges/
│       ├── lib/
│       └── store/
├── npm/                          # pacchetti npm
│   ├── dazero/                   # stub
│   └── platforms/                # generato in CI
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── docs/
│   └── plans/
│       └── 2026-04-18-dazero-design.md  # questo file
└── README.md
```
