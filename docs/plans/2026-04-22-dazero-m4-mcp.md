# Dazero — Milestone 4: MCP Orchestration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** give the agents inside dazero terminals the ability to **talk back to the canvas**. They can create tasks, spawn other agents, update status, and read each other's output — all via a local **MCP server** that exposes ~10 structured tools. This is the "recursive multi-agent" feature the product was designed around.

**Depends on:** M3 complete (tmux persistence, edges persisted, budget cap enforced, agent_config via TOML). M3's `~/.dazero/agents.toml` defines which commands are valid; M4 wires agent subprocesses to announce themselves to the server.

**Out of scope (future):** remote MCP (cross-machine), authentication/signing of tool calls, billing/usage reporting. M4 is local-only.

**Architecture changes vs M3:**
- New **MCP server module** `src/mcp.rs` speaking JSON-RPC 2.0 over:
  - A Unix domain socket `~/.dazero/mcp.sock` — preferred for performance and introspection.
  - Optional stdio mode — spawned as a child process per agent so MCP-native CLIs like Claude Code and Codex can pipe to it.
- New **CLI helper**: the same `dazero` binary gains `dazero mcp ...` subcommands, a CLI alternative to the MCP server for agents or shell scripts that don't speak MCP natively.
- Each spawned agent receives, via `initial_command`, an env var `DAZERO_AGENT_ID=<uuid>` and `DAZERO_MCP_SOCKET=~/.dazero/mcp.sock`. An agent that imports the dazero MCP client "knows" it's running inside dazero.
- **Canvas events** (node created, task status changed, agent spawned) broadcast on an **SSE stream** `/api/canvases/{id}/events` so the UI reacts instantly when an agent invokes a tool — no polling.
- **Budget cap** applies to MCP-driven spawns (same as user-driven). When the MCP tool `spawn_agent` is called and cap is reached, the call queues.

---

## Prerequisites

- M3 merged. `doctor` passes on the dev machine.
- `tmux` in PATH. `~/.dazero/agents.toml` exists.

---

## MCP tool surface (exhaustive)

All tools take a `request_id` argument (string, correlates client-server) + caller-provided params.

| # | Tool | Params | Returns | Behavior |
|---|------|--------|---------|----------|
| 1 | `create_task_list` | `canvas_id?`, `parent_agent_id?`, `title`, `tasks: [{ description, agent_type? }]` | `{ task_list_id, task_ids }` | Creates a task-list node on the caller's canvas (or the given one). Optionally tied to a parent agent for edges. |
| 2 | `create_task` | `task_list_id`, `description`, `agent_type?`, `position?` | `{ task_id }` | Appends to existing list. |
| 3 | `update_task_status` | `task_id`, `status: 'pending'\|'running'\|'done'\|'failed'` | `204` | Updates the task's status, broadcasts SSE event. |
| 4 | `spawn_agent` | `task_id?`, `agent_type`, `prompt?`, `context_files?: [{path, as?}]`, `context_note?`, `position?` | `{ agent_id, node_id }` | Creates a terminal node, spawns the agent, optionally writes a context bundle as a temp file the agent can read. Honors budget cap (returns 429 with queued=true if full). |
| 5 | `wait_for_tasks` | `task_ids: string[]`, `timeout_ms?` | `{ results: [{ task_id, status }] }` | Long-poll until all tasks are `done` or `failed` or the timeout elapses. |
| 6 | `get_task_status` | `task_id` | `{ task_id, status, spawned_agent_id? }` | One-shot. |
| 7 | `read_agent_output` | `agent_id`, `last_n_lines?` default 200 | `{ output: string, truncated: bool }` | Reads the tmux scrollback via `tmux capture-pane -p -t <session> -S -<N>`. |
| 8 | `send_to_agent` | `agent_id`, `input: string` | `204` | Writes to the agent's PTY (same bytes the UI would send). |
| 9 | `create_note` | `canvas_id?`, `content`, `position?` | `{ node_id }` | Places a Markdown note node on the canvas. Requires a new `note` node-kind in M4 schema V4. |
| 10 | `list_canvas` | `canvas_id?` | Full canvas dump | Same shape as `GET /api/canvases/:id` but server-side. |

---

## Roadmap of tasks

**18 tasks**.

**Backend core (10):**
- Task 1: JSON-RPC 2.0 framing + error mapping (`src/jsonrpc.rs`)
- Task 2: MCP socket server bound to `~/.dazero/mcp.sock`
- Task 3: MCP stdio mode — `dazero mcp stdio` subcommand
- Task 4: tool registry + dispatcher — maps method names to handlers
- Task 5: env var injection in `PtySession::spawn_shell` (`DAZERO_AGENT_ID`, `DAZERO_MCP_SOCKET`, `DAZERO_CANVAS_ID`)
- Task 6: SSE events endpoint `/api/canvases/{id}/events`
- Task 7: tools 1-3 (`create_task_list`, `create_task`, `update_task_status`)
- Task 8: tools 4-6 (`spawn_agent` with context bundle + queueing, `wait_for_tasks`, `get_task_status`)
- Task 9: tools 7-10 (`read_agent_output`, `send_to_agent`, `create_note`, `list_canvas`)
- Task 10: V4 migration — add `note` to node kinds check, plus `notes` table if rich payloads needed

**CLI helper (2):**
- Task 11: `dazero task create/update/status` subcommands — same semantics as MCP tools
- Task 12: `dazero spawn` + `dazero send` subcommands

**Frontend (5):**
- Task 13: SSE client in `lib/events.ts` — auto-reconnect, typed events
- Task 14: CanvasView subscribes to events; apply incremental updates instead of full re-fetch
- Task 15: TaskListNode shows per-task status badge (pending/running/done/failed) with live updates
- Task 16: auto-spawn toggle — when an agent creates tasks via MCP, optionally auto-spawn for each task (UI toggle per TaskList)
- Task 17: NoteNode component (Markdown rendering via tiptap or react-markdown)

**QA (1):**
- Task 18: end-to-end with a real Claude Code invocation that uses MCP — verifies the whole loop

---

## Task 1: JSON-RPC 2.0 framing

**Files:**
- Create: `crates/dazero/src/jsonrpc.rs`
- Test: `crates/dazero/tests/jsonrpc.rs`

Types:
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Request { pub jsonrpc: String, pub id: Option<Value>, pub method: String, pub params: Option<Value> }

#[derive(Debug, Serialize)]
pub struct Response { pub jsonrpc: &'static str, pub id: Option<Value>, pub result: Option<Value>, pub error: Option<JsonRpcError> }

#[derive(Debug, Serialize)]
pub struct JsonRpcError { pub code: i32, pub message: String, pub data: Option<Value> }
```

TDD asserts: parse a sample request, serialize a success response and an error response, round-trip preserves fields.

Commit: `feat(mcp): JSON-RPC 2.0 framing and error types`.

---

## Task 2: MCP socket server

**Files:**
- Create: `crates/dazero/src/mcp/mod.rs`, `src/mcp/server.rs`
- Modify: `crates/dazero/src/http.rs` (start MCP server alongside HTTP)
- Test: `tests/mcp_socket.rs`

Server: `tokio::net::UnixListener::bind("~/.dazero/mcp.sock")`. Per connection: read newline-delimited JSON (or Content-Length-framed, negotiate later), dispatch to registry, write response. One connection per agent.

Handle SIGTERM: remove the socket file on shutdown.

Test: connect via `tokio::net::UnixStream`, send `{"jsonrpc":"2.0","id":1,"method":"list_canvas","params":{}}`, expect a valid response.

Commit: `feat(mcp): socket server + list_canvas stub`.

---

## Task 3: MCP stdio mode

**Files:**
- Modify: `crates/dazero/src/cli.rs` (new subcommand `Mcp { mode: "stdio" | "socket" }`)
- Modify: `crates/dazero/src/main.rs`

`dazero mcp stdio` runs the same registry against stdin/stdout, matching the protocol used by Claude Code and Codex when they launch MCP servers as children.

Test: `cargo run -p dazero -- mcp stdio` + pipe a request on stdin, expect response on stdout.

Commit: `feat(mcp): stdio mode for MCP-native agents`.

---

## Task 4: tool registry

**Files:**
- Create: `crates/dazero/src/mcp/registry.rs`

Registry is a `HashMap<String, Arc<dyn Tool>>` where `Tool` is a trait:
```rust
#[async_trait::async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &'static str;
    async fn call(&self, state: &AppState, params: Value) -> Result<Value, JsonRpcError>;
}
```

Register all 10 tools as unit structs. Each tool deserializes params into its own struct, performs the work, returns a `Value`.

Commit: `feat(mcp): trait-based tool registry`.

---

## Task 5: agent env injection

**Files:**
- Modify: `crates/dazero/src/pty.rs`

When `PtySession::spawn_shell(cwd)` runs, also set:
- `DAZERO_AGENT_ID=<session uuid>`
- `DAZERO_MCP_SOCKET=<path>`
- `DAZERO_CANVAS_ID=<canvas id>` (pass this in from the caller — change signature)

Spawning inside `tmux` preserves these env vars for the inner `$SHELL`.

Commit: `feat(pty): inject DAZERO_* env vars for MCP-aware agents`.

---

## Task 6: SSE events stream

**Files:**
- Modify: `crates/dazero/src/api.rs`
- Create: `crates/dazero/src/events.rs` — a `broadcast::channel<CanvasEvent>` keyed by canvas_id

Endpoint: `GET /api/canvases/{id}/events` → SSE. Each event is JSON:
```json
{ "type": "node.created", "node": { ... } }
{ "type": "task.status_changed", "task_id": "...", "status": "done" }
{ "type": "edge.created", "edge": { ... } }
{ "type": "agent.spawned", "agent_id": "...", "node_id": "..." }
```

Every MCP tool that mutates state emits the corresponding event. `POST /api/...` REST endpoints also emit — so UI behaves the same way for human and agent actions.

Commit: `feat(events): SSE stream for incremental canvas updates`.

---

## Task 7: tools 1-3

**Files:**
- Create: `src/mcp/tools/{task_list.rs, task.rs, status.rs}`
- Test: `tests/mcp_tasks.rs`

Implement the three task tools on top of existing `canvas::create_task_list`, `canvas::add_task`, `canvas::update_task`. Each emits its SSE event after success.

Commit: `feat(mcp): tools create_task_list + create_task + update_task_status`.

---

## Task 8: spawn_agent + wait_for_tasks + get_task_status

**Files:**
- Create: `src/mcp/tools/{spawn.rs, wait.rs, get_status.rs}`
- Test: `tests/mcp_spawn.rs`

`spawn_agent` logic:
1. Budget check (return 429 + `queued: true` if full; caller decides to block or proceed).
2. Position: near the parent's node if `task_id` is linked to a task-list; otherwise `(120, 120)`.
3. Context bundle: write `~/.dazero/bundles/<uuid>.md` containing `context_note` + concatenated `context_files`. Pass the path to the agent as an extra env var `DAZERO_CONTEXT_BUNDLE=<path>`.
4. Call `canvas::create_node(kind=terminal, data={agent_type, spawned_from_node_id=parent, accent, task_id})`.
5. Call `pty.spawn(cwd=project.path)` with the same `initial_command` logic.
6. Emit `node.created` + `agent.spawned` + `edge.created` events.
7. Return `{ agent_id, node_id }`.

`wait_for_tasks` is implemented via a tokio `oneshot` per task or by subscribing to the SSE stream and filtering.

Commit: `feat(mcp): spawn_agent with context bundle + wait_for_tasks`.

---

## Task 9: read/send/note/list

**Files:**
- Create: `src/mcp/tools/{read_output.rs, send_input.rs, note.rs, list_canvas.rs}`

`read_agent_output` shells out to `tmux capture-pane -p -t dazero-<id> -S -<N>`.
`send_to_agent` calls `pty_session.write(input)`.
`create_note` creates a node with `kind='note'` (requires Task 10 migration).
`list_canvas` uses the existing `canvas::get_full`.

Commit: `feat(mcp): output capture, input send, note, list_canvas`.

---

## Task 10: V4 migration — note node kind

**Files:**
- Create: `migrations/V4__notes.sql`

```sql
-- Update nodes kind CHECK by recreating the table (SQLite doesn't support ALTER TABLE CHECK modification cleanly).
-- Alternative: store kind as plain TEXT without CHECK; rely on application validation. Simpler for M4.

-- Approach chosen: drop the CHECK constraint by creating a new table + copy + swap.
-- Or: just loosen validation at the application layer. Pick the app-layer route:
-- This migration is a no-op SQL (ALTER TABLE ADD nothing), but the app code in canvas.rs
-- stops enforcing 'terminal' | 'task_list' and accepts 'note' as well.
```

Actual migration: an explicit `PRAGMA foreign_keys=OFF; BEGIN; ...rebuild nodes table with new CHECK... COMMIT; PRAGMA foreign_keys=ON;` sequence. Tedious but correct. Commit pattern documented in Cargo comments.

Commit: `feat(db): V4 — allow kind='note' on nodes`.

---

## Tasks 11-12: CLI helper

CLI subcommands mirror MCP tools for users who write shell scripts:

```bash
dazero task create --list-id X --description "..."
dazero task update --id Y --status done
dazero spawn --agent-type claude-code --task-id Z
dazero send --agent-id A "input"
```

Each wraps an HTTP call to the local daemon (not a direct MCP call — simpler).

Commit: `feat(cli): dazero task/spawn/send subcommands` (2 commits).

---

## Task 13: UI SSE client

**Files:**
- Create: `ui/src/lib/events.ts`

Typed EventSource wrapper with reconnect and typed events.

Commit: `feat(ui): typed SSE client`.

---

## Task 14: CanvasView reactive updates

**Files:**
- Modify: `ui/src/CanvasView/CanvasView.tsx`

On mount, open an SSE connection. Handle each event type by patching the React Flow state incrementally:
- `node.created` → `setNodes([...nodes, apiNodeToRf(event.node)])`
- `edge.created` → edges state update
- `task.status_changed` → find the task-list node, update its `data.tasks[i].status`
- etc.

Remove the "re-fetch entire canvas after createNode" pattern (saves a round-trip).

Commit: `feat(ui): incremental canvas updates via SSE`.

---

## Task 15: TaskListNode status badges

**Files:**
- Modify: `ui/src/CanvasView/nodes/TaskListNode.tsx`

Each task row shows a small colored dot:
- gray = pending
- blue (animated) = running
- green = done
- red = failed

Updates live when an agent changes status via MCP.

Commit: `feat(ui): per-task status badge with live updates`.

---

## Task 16: auto-spawn toggle

**Files:**
- Modify: `ui/src/CanvasView/nodes/TaskListNode.tsx` — add a toggle "Auto-spawn on create"
- Modify: agent workflow hint: when an agent calls `create_task_list(tasks=[...])`, if the parent task-list has auto-spawn on, the backend also calls `spawn_agent` for each task automatically (using `task.agent_type` or preset default).

Commit: `feat: auto-spawn agent when a task is added to a list with auto-spawn enabled`.

---

## Task 17: NoteNode component

**Files:**
- Create: `ui/src/CanvasView/nodes/NoteNode.tsx`
- Add to `nodeTypes` in CanvasView

Markdown rendering with `react-markdown` or a lighter alternative. Click to edit.

Commit: `feat(ui): NoteNode with Markdown rendering`.

---

## Task 18: real-world acceptance

Have a Claude Code instance running inside a dazero terminal call the MCP server to create 3 subtasks, spawn 3 child Claude Code instances, and monitor them until done. Verify in the UI:
- 3 new terminal nodes appear.
- 3 edges from the task-list to each child.
- Task statuses go pending → running → done.
- Parent waits for children (via `wait_for_tasks`).
- Close the parent terminal → children keep running.

Commit: `test: end-to-end MCP multi-agent orchestration`.

Local tag: `v0.4.0-rc1`.

---

## Appendix — Risks & watch-outs

- **Socket permissions.** `~/.dazero/mcp.sock` must be mode 600 (user-only); agents running as the same user connect without friction. No cross-user attack surface.
- **Queueing.** If budget is full, `spawn_agent` returning `queued:true` needs a client-side retry or a server-side wait-for-slot primitive. Phase 1: return 429 and let the caller retry. Phase 2: server holds the request until a slot frees.
- **Context bundle leakage.** The bundle file is on disk in `~/.dazero/bundles/`. Document that it's readable by the user's processes (standard local dev assumption) and purge old bundles on daemon startup.
- **MCP version drift.** Claude Code, Codex, Gemini CLI track the MCP spec at different paces. Implement the widest-compat baseline (spec version 2024-11-05 or later). Document the target in README.

---

## Skills to use

- `@superpowers:test-driven-development`
- `@superpowers:systematic-debugging` for JSON-RPC and SSE issues
- `@superpowers:subagent-driven-development` for per-task execution

---

## Progression after M4

M5 (from the design doc) polishes: Homebrew cask, Apple code signing + notarization, docs site, `cmd+P` project switcher, keyboard shortcuts. No new major features — just stabilization.
