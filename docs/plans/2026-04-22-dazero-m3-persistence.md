# Dazero — Milestone 3: Persistence, tmux, Agent Config, Edges

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** transform dazero from "in-memory PTYs that die with the daemon" into a **resilient workstation** where agent sessions survive daemon restarts, the user's config file defines custom agent presets, and parent→child edges are first-class persisted entities on the canvas.

**Explicitly out of scope (M4):** MCP server, agent-driven orchestration, auto-spawn from tasks by AI, context bundle propagation. M3 is all about **durability and structure** — M4 is about **agents talking back**.

**Architecture changes vs M2:**
- `PtyRegistry` grows a **tmux backend**: `PtySession::spawn_shell` now wraps `tmux new-session -d -s dazero-<uuid> -c <cwd>` + pipe-pane → tmux-control-mode for async output. Reconnect attaches instead of re-spawning.
- New table **`edges`** in V3 migration. Full CRUD + persisted JSON payload. Derived edges from M2 migrate to real rows at startup.
- New **agent config file** `~/.dazero/agents.toml` (TOML) — overrides and extends the 5 built-in presets. Editable by the user with their own commands.
- Daemon startup **reconnects** to alive tmux sessions found on disk (session names with `dazero-` prefix), rebuilds the `PtyRegistry`, and restarts the WebSocket bridge per-agent.
- New **budget cap** enforced on `POST /api/agents`: reject with 429 when the count of active sessions exceeds a configurable limit.

**Tech Stack additions:** tmux 3.3+ (already system-installed, enforced in `doctor` subcommand), `toml` crate for config parsing, `notify` crate for watching `agents.toml` (optional, M5).

---

## Prerequisites

- M2 is merged or at least its branch is the working base.
- `tmux -V` ≥ 3.3 on the host (macOS/Linux; Windows WSL for M5).
- M2's 31 tests all pass at HEAD.

---

## Roadmap of tasks

**15 tasks**, grouped by layer.

**Backend (11):**
- Task 1: `doctor` subcommand — asserts tmux and rustc versions, dies early if missing
- Task 2: tmux session wrapper — refactor `PtySession` to optionally use tmux
- Task 3: session reconnect — on daemon startup, list `dazero-*` tmux sessions and rebuild registry
- Task 4: V3 migration — add `edges` table
- Task 5: edges CRUD — `POST /api/canvases/{id}/edges`, `DELETE /api/edges/{id}`, `GET /api/canvases/{id}` includes edges
- Task 6: edges migrated from M2 derivation — on first GET after upgrade, fabricate real rows for existing `spawned_from_node_id` terminals
- Task 7: agent config file — `~/.dazero/agents.toml` parsed on startup, exposed via `GET /api/agent-presets`
- Task 8: preset validation + CRUD endpoints for user-defined presets (create/delete via UI settings panel)
- Task 9: budget cap — config `max_concurrent_agents` default 5; 429 + `code: "budget_exceeded"` when exceeded
- Task 10: PTY resize propagation — WS control messages `{type:"resize",cols,rows}` handled, forwarded to tmux via `tmux resize-window -t <session>`
- Task 11: integration test — full lifecycle: spawn agent → kill daemon → restart daemon → reconnect → WS works, scrollback preserved

**Frontend (3):**
- Task 12: agent preset settings panel — list user-defined + built-in, add/edit/delete custom
- Task 13: edge rendering — switch from derived useMemo to loaded from API, add context menu to delete edges
- Task 14: budget cap UI — show current/max in toolbar, disable spawn buttons when full

**QA (1):**
- Task 15: acceptance — kill daemon mid-session, restart, verify terminal continues; verify config file changes hot-reload

---

## Task 1: `doctor` subcommand

**Files:**
- Modify: `crates/dazero/src/cli.rs` (already has `Doctor`)
- Modify: `crates/dazero/src/main.rs` (flesh out the Doctor arm)
- Test: `crates/dazero/tests/doctor.rs`

**TDD:**

```rust
#[test]
fn doctor_prints_tmux_version() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_dazero"))
        .arg("doctor")
        .output().unwrap();
    let s = String::from_utf8_lossy(&out.stdout);
    assert!(s.contains("tmux"), "expected tmux in doctor output, got: {s}");
    assert!(s.contains("rustc") || s.contains("dazero"), s.to_string());
}
```

Implementation:
```rust
Some(Command::Doctor) => {
    println!("dazero {}", env!("CARGO_PKG_VERSION"));
    let tmux = std::process::Command::new("tmux").arg("-V").output();
    match tmux {
        Ok(o) if o.status.success() => {
            print!("  {}", String::from_utf8_lossy(&o.stdout));
        }
        _ => {
            println!("  tmux: NOT FOUND (install via `brew install tmux` or your package manager)");
            std::process::exit(2);
        }
    }
    Ok(())
}
```

Commit: `feat(cli): doctor subcommand asserts tmux and prints versions`.

---

## Task 2: tmux session wrapper

**Files:**
- Modify: `crates/dazero/src/pty.rs`
- Test: `crates/dazero/tests/pty_tmux.rs`

**Key idea:** `PtySession::spawn_shell` gains a flag `use_tmux: bool` (default true). When true:
1. Generate session name `dazero-<uuid>`.
2. `tmux new-session -d -s <name> -c <cwd>` to create a detached tmux session.
3. `tmux pipe-pane -t <name> -I -O 'cat'` isn't quite what we want for control mode — instead use `tmux -C attach -t <name>` in a child process. Control mode gives us structured events over stdio.
4. Alternatively, simpler: `tmux attach-session -t <name>` in a fresh PTY owned by dazero. The existing portable-pty code spawns `tmux attach-session -t <name>` instead of `$SHELL`.

**Chosen approach: tmux attach via PTY.** Minimal code change:
```rust
pub fn spawn_shell(cwd: Option<PathBuf>) -> Result<Self> {
    let session_name = format!("dazero-{}", uuid::Uuid::new_v4());
    // Create the session detached
    let mut new_cmd = std::process::Command::new("tmux");
    new_cmd.args(["new-session", "-d", "-s", &session_name]);
    if let Some(ref d) = cwd { new_cmd.args(["-c", d.to_str().unwrap()]); }
    let status = new_cmd.status().context("tmux new-session")?;
    if !status.success() { return Err(anyhow::anyhow!("tmux new-session failed")); }

    // Attach from inside a PTY we own (portable-pty)
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })?;
    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["attach-session", "-t", &session_name]);
    cmd.env("TERM", std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()));
    let _child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);
    // ...existing reader/writer wiring, plus store session_name for later kill
}
```

Add `session_name: String` to `PtySession`.

On `Drop` or explicit `kill()`, also `tmux kill-session -t <name>`.

Commit: `feat(pty): wrap PTY in a detached tmux session for persistence`.

---

## Task 3: session reconnect on daemon startup

**Files:**
- Modify: `crates/dazero/src/pty.rs` (`PtyRegistry::recover`)
- Modify: `crates/dazero/src/http.rs` (`serve_with_db` calls `recover` before serving)
- Test: `crates/dazero/tests/pty_recover.rs`

Logic:
1. On startup, `tmux list-sessions -F '#S'` → filter lines starting with `dazero-`.
2. For each, extract the uuid suffix, build `PtySession` by re-attaching (same as spawn minus `new-session`).
3. Insert into the registry.

Test: create a tmux session manually `tmux new-session -d -s dazero-deadbeef-...`, call `PtyRegistry::recover()`, assert `registry.len() >= 1`.

Commit: `feat(pty): reconnect to existing dazero-* tmux sessions on startup`.

---

## Task 4: V3 migration — edges table

**Files:**
- Create: `crates/dazero/migrations/V3__edges.sql`

```sql
CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind TEXT,         -- nullable, 'task_spawn' | 'parent_child' | 'manual' | null
  label TEXT,
  data TEXT          -- JSON for future extension (color, animation flag, etc.)
);
CREATE INDEX idx_edges_canvas ON edges(canvas_id);
```

Just migration + Rust types; no endpoints yet.

Commit: `feat(db): V3 migration — edges table`.

---

## Task 5: edges CRUD endpoints

**Files:**
- Modify: `crates/dazero/src/canvas.rs` (add `Edge`, `CreateEdge`, `create_edge`, `delete_edge`, `list_edges`)
- Modify: `crates/dazero/src/api.rs`
- Modify: `get_full` returns `edges: Vec<Edge>`
- Test: `crates/dazero/tests/edges_api.rs`

Endpoints:
- `POST   /api/canvases/{id}/edges` — body `{ source_node_id, target_node_id, kind?, label?, data? }` → 201 + Edge
- `DELETE /api/edges/{id}` → 204

Updated `CanvasFull` type includes `edges[]`. Update `types.ts` in Task 13.

Commit: `feat(api): persisted edges — POST/DELETE + GET canvas includes them`.

---

## Task 6: edge migration from M2 derivation

**Files:**
- Modify: `crates/dazero/src/canvas.rs` (`get_full` does the one-time fabrication)

On `get_full`, BEFORE returning, for each terminal node whose `data.spawned_from_node_id` is set AND for which no matching edge exists in the `edges` table, INSERT a new edge row with `kind='task_spawn'`.

This is a safe idempotent migration step — existing canvases pick up real edges the first time they're loaded after the M3 upgrade. No explicit batch migration needed.

Commit: `feat(canvas): migrate M2 spawned_from_node_id derivation into persisted edges`.

---

## Task 7: agent config file

**Files:**
- Create: `crates/dazero/src/agent_config.rs`
- Modify: workspace `Cargo.toml` — add `toml = "0.8"` dep
- Modify: `crates/dazero/src/http.rs` (load on startup, expose state)
- Test: `crates/dazero/tests/agent_config.rs`

```toml
# ~/.dazero/agents.toml
max_concurrent_agents = 8

[[presets]]
key = "claude-sonnet-4-6"
label = "Claude Sonnet 4.6"
initial_command = "claude --model claude-sonnet-4-6"
accent = "#e08a4a"

[[presets]]
key = "aider-local"
label = "Aider (local LLM)"
initial_command = "aider --model ollama/llama3.1"
accent = "#8ae68a"
```

Built-in presets shipped in the binary; user-defined merged on top (keyed on `key`, user wins).

New endpoint: `GET /api/agent-presets` → merged list.

TDD: write a sample config to a temp dir, load it via `AgentConfig::load_from`, assert 2 user presets present on top of 5 built-ins = 7 total; assert `max_concurrent_agents = 8`.

Commit: `feat(config): ~/.dazero/agents.toml for user-defined agent presets and budget cap`.

---

## Task 8: preset CRUD via API

**Files:**
- Modify: `crates/dazero/src/api.rs`
- Test: `crates/dazero/tests/preset_api.rs`

Endpoints:
- `GET    /api/agent-presets` → merged list
- `POST   /api/agent-presets` → persist a new user preset to `agents.toml`
- `DELETE /api/agent-presets/{key}` → remove from `agents.toml` (404 if key is built-in)

Concurrency: `agents.toml` is read/written under a `tokio::sync::Mutex`.

Commit: `feat(api): preset CRUD writes to ~/.dazero/agents.toml`.

---

## Task 9: budget cap

**Files:**
- Modify: `crates/dazero/src/api.rs` (`create_agent` checks `pty.len() < max`)
- Modify: `crates/dazero/src/pty.rs` (`PtyRegistry::len()`)
- Test: extend `tests/agents_api.rs`

`AppError` gets a new helper `too_many("budget exceeded", code="budget_exceeded")` → 429.

Test: set `max_concurrent_agents=2` via test-only env var `DAZERO_MAX_AGENTS`, spawn 2 agents (OK), spawn 3rd (429 + code).

Commit: `feat(api): enforce max_concurrent_agents with 429 budget_exceeded`.

---

## Task 10: PTY resize propagation

**Files:**
- Modify: `crates/dazero/src/ws.rs` (parse control frames)
- Test: add to `tests/pty_ws.rs`

Wire protocol: a JSON control frame from the client `{"type":"resize","cols":120,"rows":40}`. Handler detects text that starts with `{"type":` and handles it as control; otherwise forwards to PTY.

Resize flow: `tmux resize-window -t dazero-<uuid> -x 120 -y 40`. Optionally also `PtyPair::resize` on the portable-pty side.

Test: send a resize frame; then send `stty size\n`; expect output to contain `40 120`.

Commit: `feat(ws): resize control frames propagated to tmux window`.

---

## Task 11: restart integration test

**Files:**
- Create: `tests/restart.rs` — ignored by default (`#[ignore]`), enable with `cargo test -- --ignored`

Scenario:
1. Spawn daemon1 on port X.
2. Create project + terminal + agent.
3. Send `echo resilience-check\n` via WS. Observe output.
4. Kill daemon1 (do NOT kill tmux sessions).
5. Start daemon2 on port X+1 with the SAME DB.
6. Connect WS `/ws/pty/<agent_id>` — expect the session to still be there.
7. Send another command, verify output.

Commit: `test: restart integration verifies tmux reconnect preserves sessions`.

---

## Task 12: UI — agent preset settings panel

**Files:**
- Create: `ui/src/Settings/Settings.tsx`
- Add `/settings` route
- Add a gear icon in Dashboard sidebar

UI: list all presets (built-in vs user, badged). "+ Add preset" opens an inline form: `key`, `label`, `initial_command`, `accent`. Delete available on user presets only.

Commit: `feat(ui): settings panel for agent presets`.

---

## Task 13: UI — edges from API + delete

**Files:**
- Modify: `ui/src/types.ts` — add `Edge` type
- Modify: `ui/src/lib/api.ts` — add `edges.create/delete`, update `CanvasFull`
- Modify: `ui/src/CanvasView/CanvasView.tsx` — switch from `useMemo` derived to API-loaded edges
- Add: right-click on edge → delete (via React Flow `onEdgeContextMenu` or just a small × that appears on hover)

Commit: `feat(ui): edges loaded from API with delete support`.

---

## Task 14: UI — budget cap indicator

**Files:**
- Modify: `ui/src/CanvasView/Toolbar.tsx` — show `3 / 5 agents`, disable + buttons when full
- Modify: `ui/src/CanvasView/CanvasView.tsx` — call `GET /api/agent-presets` (also returns `max_concurrent_agents`) on mount, maintain live count

Commit: `feat(ui): toolbar shows budget counter and disables spawn when full`.

---

## Task 15: M3 acceptance checklist (manual)

- [ ] `cargo test --all --locked` passes all tests (including tmux recovery).
- [ ] `dazero doctor` prints tmux version and exits 0.
- [ ] Start daemon, spawn a terminal, type something → seen.
- [ ] `pkill -f 'target/release/dazero'` (kill daemon, leave tmux alive).
- [ ] Start daemon again. Refresh browser → terminal reconnects, scrollback preserved.
- [ ] Edit `~/.dazero/agents.toml`, add a preset → appears in toolbar after refresh.
- [ ] Spawn agents up to `max_concurrent_agents` → 6th is refused with 429 badge in UI.
- [ ] Resize terminal node → `stty size` inside shell reflects new dimensions.
- [ ] Delete a task-list → its edges to spawned terminals are gone (cascade).

Commit local tag `v0.3.0-rc1`.

---

## Appendix — Skills to use

- `@superpowers:test-driven-development`
- `@superpowers:verification-before-completion`
- `@superpowers:systematic-debugging` for the tmux reconnection task (fiddly)
