# Dazero — Milestone 2 (expanded): Canvas, Projects, Task-list

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** transform dazero from "a single shell in the browser" into the **first visually demo-able version of the product**: an infinite canvas where the user creates projects (via folder picker or GitHub URL clone), opens a canvas per project, drags in multiple Terminal nodes (each a real independent shell in that project's cwd), and drags in Task-List nodes with a manual checklist. Canvas viewport and nodes persist across restarts.

**Explicitly out of scope (deferred to M3):** tmux detached sessions, preset agent-types beyond plain shell, MCP server, budget cap, agents delegating to other agents, parent→child edges created automatically.

**Architecture changes vs M1:** the Rust daemon gains a **SQLite store** (`rusqlite`) and a **PTY session registry** keyed by agent UUID. The WebSocket endpoint becomes `/ws/pty/:agent_id` (stateful — resumes the same session on reconnect during the session lifetime). The React UI gains **React Router** (dashboard ↔ canvas view), a **Zustand store** for client-side canvas state, **React Flow** for the canvas, and custom node components `TerminalNode` and `TaskListNode`.

**Tech Stack additions:** `rusqlite`, `refinery` (migrations), `axum` path params, `zustand` already in UI deps, `reactflow` added, `react-router-dom` added.

---

## Prerequisites

- M1 is merged (or at minimum, `m1-foundations` branch is the working base).
- The engineer executing this plan runs on top of M1 commits. Verify: `git log --oneline -1` shows an M1 commit, `cargo test --all --locked` passes 6/6, `cd ui && bun run build` succeeds.
- Tmux IS NOT used in M2. You can skip `tmux -V` verification.

---

## Target repo structure at end of M2

```
dazero/
├── crates/dazero/src/
│   ├── main.rs
│   ├── lib.rs
│   ├── cli.rs
│   ├── http.rs
│   ├── ws.rs
│   ├── pty.rs            ← extended: PtyRegistry + per-id lookup
│   ├── db.rs             ← NEW: SQLite connection + migrations
│   ├── project.rs        ← NEW: project CRUD, git clone, gh integration
│   ├── canvas.rs         ← NEW: nodes/edges/viewport CRUD
│   ├── api.rs            ← NEW: REST handlers (projects, canvas, agents)
│   └── ui_assets.rs
├── crates/dazero/migrations/
│   ├── V1__initial.sql
│   └── V2__add_task_lists.sql
├── ui/src/
│   ├── main.tsx          ← add BrowserRouter
│   ├── App.tsx           ← routes
│   ├── Dashboard/
│   │   ├── Dashboard.tsx
│   │   ├── ProjectCard.tsx
│   │   └── NewProjectWizard.tsx
│   ├── CanvasView/
│   │   ├── CanvasView.tsx
│   │   ├── Toolbar.tsx
│   │   └── nodes/
│   │       ├── TerminalNode.tsx   ← wraps the M1 Terminal.tsx component
│   │       └── TaskListNode.tsx
│   ├── lib/
│   │   ├── api.ts        ← typed REST client
│   │   └── ws.ts         ← (existing)
│   ├── store/
│   │   └── canvasStore.ts ← Zustand
│   └── types.ts          ← shared types (Project, Node, Task, ...)
└── docs/plans/
    ├── 2026-04-18-dazero-design.md
    ├── 2026-04-18-dazero-m1-foundations.md
    └── 2026-04-19-dazero-m2-canvas.md  ← this file
```

---

## Data model (SQLite schema, M2 subset)

```sql
-- V1__initial.sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,               -- absolute cwd
  git_remote TEXT,                  -- nullable
  created_at INTEGER NOT NULL,
  last_opened_at INTEGER
);

CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewport_x REAL NOT NULL DEFAULT 0,
  viewport_y REAL NOT NULL DEFAULT 0,
  viewport_zoom REAL NOT NULL DEFAULT 1
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('terminal','task_list')),
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL,
  height REAL,
  data TEXT NOT NULL,               -- JSON payload per node kind
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_nodes_canvas ON nodes(canvas_id);

-- V2__add_task_lists.sql
CREATE TABLE task_lists (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
  title TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  task_list_id TEXT NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  position INTEGER NOT NULL
);

CREATE INDEX idx_tasks_list ON tasks(task_list_id, position);
```

The data JSON for `nodes` depends on `kind`:
- `terminal`: `{ "agent_id": "<uuid>", "cwd": "<path>", "title": "<string>" }`
- `task_list`: `{}` (actual content lives in `task_lists` + `tasks` tables)

The `agent_id` in a terminal node identifies a `PtySession` in the in-memory registry. Sessions are NOT persisted across daemon restarts in M2 (that's M3's tmux detached). On restart, the client reconnects — the UI shows a "disconnected, click to restart" state on each TerminalNode until the user re-spawns.

---

## REST API surface (M2)

All under `/api/` — OpenAPI spec optional (not required for M2).

### Projects

- `GET  /api/projects` → list of projects (sorted by `last_opened_at DESC`)
- `POST /api/projects` → body `{ "mode": "folder"|"clone", "path": "<abs>", "git_url": "<url>", "name": "<opt>" }`, returns created project
- `GET  /api/projects/:id` → single project + its `canvas_id`
- `PATCH /api/projects/:id` → body `{ "name"?: "...", "last_opened_at"?: number }`
- `DELETE /api/projects/:id` → removes project and cascades (canvas, nodes, tasks). Does NOT delete files on disk.

### Canvas state

- `GET  /api/canvases/:id` → viewport + list of nodes + list of task_lists with tasks
- `PATCH /api/canvases/:id/viewport` → body `{ x, y, zoom }`
- `POST /api/canvases/:id/nodes` → body `{ kind, position_x, position_y, data }`, returns created node
- `PATCH /api/nodes/:id` → body `{ position_x?, position_y?, width?, height?, data? }`
- `DELETE /api/nodes/:id` → removes node (task_list + tasks cascade)

### Task-list

- `POST /api/task-lists/:id/tasks` → body `{ description, position }`, returns created task
- `PATCH /api/tasks/:id` → body `{ description?, status? }`
- `DELETE /api/tasks/:id` → removes task

### Agent / PTY lifecycle

- `POST /api/agents` → body `{ project_id, node_id, cwd?: string }`. Spawns a shell and registers it. Returns `{ agent_id }`. The UI then opens `ws://.../ws/pty/{agent_id}`.
- `DELETE /api/agents/:id` → tears down session.
- `WS   /ws/pty/:agent_id` → stateful bridge (as in M1 but keyed by id; if the id is unknown, server closes with 4404).

---

## Roadmap of tasks

There are **21 tasks** in M2, grouped by layer. Each task is TDD when applicable, bite-sized, and ends with a commit.

**Rust backend (11 tasks):**
- Task 1: `db.rs` + migrations + smoke test
- Task 2: project CRUD + `POST /api/projects` (folder mode)
- Task 3: project clone mode (`git clone`)
- Task 4: `GET /api/projects` + `GET/PATCH/DELETE /api/projects/:id`
- Task 5: `canvas.rs` + canvas CRUD with auto-created canvas on project creation
- Task 6: `api.rs` wiring + node CRUD endpoints
- Task 7: task_lists/tasks CRUD endpoints
- Task 8: `PtyRegistry` + `POST /api/agents` + `/ws/pty/:id`
- Task 9: tear down endpoint + reaper on WS disconnect (optional cleanup)
- Task 10: error responses unified (JSON with `{error, code}`)
- Task 11: integration test covering "create project → create canvas node → spawn agent → ws works"

**Frontend (9 tasks):**
- Task 12: React Router + App shell + placeholder Dashboard/CanvasView
- Task 13: typed `api.ts` client (REST)
- Task 14: Dashboard list view (fetches `/api/projects`)
- Task 15: NewProjectWizard (folder + clone modes)
- Task 16: CanvasView skeleton with React Flow (empty canvas, toolbar)
- Task 17: TerminalNode custom React Flow node (reuses M1 Terminal.tsx internals, talks to `/ws/pty/:id`)
- Task 18: TaskListNode custom React Flow node (checklist editing)
- Task 19: viewport + node-position persistence (debounced PATCHes)
- Task 20: delete/move/rename nodes from UI

**Integration & QA (1 task):**
- Task 21: end-to-end smoke + manual QA + commit

---

## Task 1: SQLite + migrations

**Files:**
- Modify: `crates/dazero/Cargo.toml` (add `rusqlite`, `refinery`, `refinery_core`)
- Create: `crates/dazero/src/db.rs`
- Create: `crates/dazero/migrations/V1__initial.sql`
- Modify: `crates/dazero/src/lib.rs` (`pub mod db;`)
- Test: `crates/dazero/tests/db.rs`

**Step 1: Write test `tests/db.rs`**

```rust
use dazero::db;
use tempfile::TempDir;

#[tokio::test]
async fn opens_and_migrates_sqlite() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("dazero.db");
    let conn = db::open(&path).expect("open");
    // Verify schema by querying sqlite_master
    let tables: Vec<String> = {
        let mut stmt = conn.lock().unwrap();
        let mut q = stmt.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").unwrap();
        let rows = q.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.filter_map(Result::ok).collect()
    };
    assert!(tables.contains(&"projects".to_string()), "tables were {tables:?}");
    assert!(tables.contains(&"canvases".to_string()));
    assert!(tables.contains(&"nodes".to_string()));
}
```

**Step 2: Add deps**

In `Cargo.toml`:

```toml
[workspace.dependencies]
# additions
rusqlite = { version = "0.33", features = ["bundled"] }
refinery = { version = "0.8", features = ["rusqlite"] }
tempfile = "3"
```

Then in `crates/dazero/Cargo.toml`:

```toml
[dependencies]
rusqlite.workspace = true
refinery.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

**Step 3: Migration file `crates/dazero/migrations/V1__initial.sql`**

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  git_remote TEXT,
  created_at INTEGER NOT NULL,
  last_opened_at INTEGER
);

CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewport_x REAL NOT NULL DEFAULT 0,
  viewport_y REAL NOT NULL DEFAULT 0,
  viewport_zoom REAL NOT NULL DEFAULT 1
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('terminal','task_list')),
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL,
  height REAL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_nodes_canvas ON nodes(canvas_id);
```

**Step 4: `crates/dazero/src/db.rs`**

```rust
use anyhow::{Context, Result};
use refinery::embed_migrations;
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

embed_migrations!("migrations");

pub type Db = Arc<Mutex<Connection>>;

pub fn open(path: &Path) -> Result<Db> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let mut conn = Connection::open(path).context("open sqlite")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrations::runner().run(&mut conn).context("run migrations")?;
    Ok(Arc::new(Mutex::new(conn)))
}
```

**Step 5:** Add `pub mod db;` to `lib.rs`.

**Step 6:** Run test.

```bash
source "$HOME/.cargo/env"
cargo test -p dazero --test db -- --nocapture
```
Expected: PASS.

**Step 7:** `cargo fmt --all`, `cargo clippy --all-targets --locked -- -D warnings` — clean.

**Step 8:** Commit.

```bash
git add crates/dazero Cargo.toml
git commit -m "feat(db): embedded SQLite + refinery migrations with projects/canvases/nodes"
```

---

## Task 2: Project CRUD — create from folder

**Files:**
- Create: `crates/dazero/src/project.rs`
- Modify: `crates/dazero/src/lib.rs` (`pub mod project;`)
- Create: `crates/dazero/src/api.rs` (will grow across tasks)
- Modify: `crates/dazero/src/http.rs` (mount `/api` router, inject db + state)
- Test: `crates/dazero/tests/projects_api.rs`

**Step 1: Test**

```rust
// tests/projects_api.rs (partial — this task)
#[tokio::test]
async fn create_project_folder_mode() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let tmp_proj = tempfile::TempDir::new().unwrap();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "mode": "folder",
        "path": tmp_proj.path().to_str().unwrap(),
        "name": "myproj"
    });
    let resp = client.post(format!("http://{addr}/api/projects"))
        .json(&body).send().await.unwrap();
    assert_eq!(resp.status(), 201);
    let j: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(j["name"], "myproj");
    assert_eq!(j["path"], tmp_proj.path().to_str().unwrap());
    assert!(j["canvas_id"].is_string(), "must auto-create canvas");
}

async fn spawn_test_daemon() -> (std::net::SocketAddr, tempfile::TempDir) {
    use std::time::Duration;
    let tmp = tempfile::TempDir::new().unwrap();
    let db_path = tmp.path().join("test.db");
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    tokio::spawn(async move { dazero::http::serve_with_db(port, db_path).await.unwrap(); });
    for _ in 0..30 {
        if tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_ok() { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    (([127, 0, 0, 1], port).into(), tmp)
}
```

**Step 2: `project.rs`**

```rust
use crate::db::Db;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub git_remote: Option<String>,
    pub created_at: i64,
    pub last_opened_at: Option<i64>,
    pub canvas_id: String,
}

pub fn create_from_folder(db: &Db, path: &Path, name: Option<String>) -> Result<Project> {
    let abs = std::fs::canonicalize(path).context("canonicalize path")?;
    let name = name.unwrap_or_else(|| {
        abs.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "untitled".into())
    });
    let git_remote = detect_git_remote(&abs);
    let id = uuid::Uuid::new_v4().to_string();
    let canvas_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO projects(id,name,path,git_remote,created_at,last_opened_at) VALUES(?,?,?,?,?,?)",
            rusqlite::params![id, name, abs.to_string_lossy(), git_remote, now, now],
        )?;
        conn.execute(
            "INSERT INTO canvases(id,project_id) VALUES(?,?)",
            rusqlite::params![canvas_id, id],
        )?;
    }

    Ok(Project {
        id, name,
        path: abs.to_string_lossy().to_string(),
        git_remote, created_at: now, last_opened_at: Some(now),
        canvas_id,
    })
}

fn detect_git_remote(path: &Path) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["-C"]).arg(path)
        .args(["config", "--get", "remote.origin.url"])
        .output().ok()?;
    if !out.status.success() { return None; }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}
```

Add `chrono = { version = "0.4", default-features = false, features = ["std", "clock"] }` to workspace deps and to crate deps.

**Step 3: `api.rs`**

```rust
use crate::db::Db;
use crate::project;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json, Router};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum CreateProject {
    Folder { path: String, #[serde(default)] name: Option<String> },
    Clone  { git_url: String, #[serde(default)] name: Option<String> },
}

#[derive(Clone)]
pub struct ApiState {
    pub db: Db,
}

pub fn routes(state: ApiState) -> Router {
    Router::new()
        .route("/api/projects", axum::routing::post(create_project))
        .with_state(state)
}

async fn create_project(
    State(state): State<ApiState>,
    Json(body): Json<CreateProject>,
) -> Result<(StatusCode, Json<project::Project>), AppError> {
    let p = match body {
        CreateProject::Folder { path, name } => {
            project::create_from_folder(&state.db, std::path::Path::new(&path), name)?
        }
        CreateProject::Clone { .. } => return Err(AppError(anyhow::anyhow!("clone mode in task 3"))),
    };
    Ok((StatusCode::CREATED, Json(p)))
}

pub struct AppError(pub anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for AppError { fn from(e: E) -> Self { AppError(e.into()) } }
impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::INTERNAL_SERVER_ERROR,
         Json(serde_json::json!({"error": self.0.to_string()}))).into_response()
    }
}
```

**Step 4: `http.rs` additions**

Add a `serve_with_db` helper:

```rust
pub async fn serve_with_db(port: u16, db_path: std::path::PathBuf) -> Result<()> {
    let db = crate::db::open(&db_path)?;
    let api_state = crate::api::ApiState { db: db.clone() };
    let app = Router::new()
        .route("/health", get(health))
        .route("/ws/echo", get(ws::echo_handler))
        .route("/ws/pty", get(ws::pty_handler))
        .merge(crate::api::routes(api_state))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http());
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!(%addr, "dazero listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

Update `main.rs`:

```rust
Some(Command::Start { port, no_open }) => {
    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(async move {
        if !no_open { /* same as before */ }
        let db_path = dirs::home_dir().unwrap_or_default().join(".dazero/dazero.db");
        dazero::http::serve_with_db(port, db_path).await
    })?;
    Ok(())
}
```

Add `dirs = "5"` to workspace deps and crate deps.

**Step 5:** `cargo test -p dazero --test projects_api` → PASS.

**Step 6:** fmt, clippy, commit.

```
feat(api): POST /api/projects folder mode with auto-canvas
```

---

## Task 3: Project clone mode

**Files:**
- Modify: `crates/dazero/src/project.rs`
- Modify: `crates/dazero/src/api.rs`
- Test: `crates/dazero/tests/projects_api.rs` (add test)

**Step 1: Add test**

```rust
#[tokio::test]
async fn create_project_clone_mode() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let client = reqwest::Client::new();
    // Clone a small public repo
    let body = serde_json::json!({
        "mode": "clone",
        "git_url": "https://github.com/octocat/Hello-World.git",
        "name": "hello-test"
    });
    let resp = client.post(format!("http://{addr}/api/projects"))
        .json(&body).send().await.unwrap();
    assert_eq!(resp.status(), 201);
    let j: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(j["name"], "hello-test");
    let p = std::path::Path::new(j["path"].as_str().unwrap());
    assert!(p.exists() && p.join(".git").exists());
    // Cleanup the clone
    let _ = std::fs::remove_dir_all(p);
}
```

This test requires network + public Hello-World. Mark it `#[ignore]` by default to keep CI fast, and document how to run: `cargo test --test projects_api -- --ignored`.

Actually better: use a local bare repo as the "remote" to avoid network.

```rust
// Instead of hitting octocat, set up a local bare repo
let bare = tempfile::TempDir::new().unwrap();
std::process::Command::new("git")
    .args(["init", "--bare", bare.path().to_str().unwrap()])
    .status().unwrap();
// Push an initial commit into it from a seed repo
let seed = tempfile::TempDir::new().unwrap();
std::process::Command::new("git")
    .args(["init", seed.path().to_str().unwrap()])
    .status().unwrap();
// ... (full setup: touch a file, commit, add remote, push)
// Then clone in the API test from bare.path()
```

Use this offline approach for the CI-safe version. Full working example is ~20 lines; embed it in a helper `fn make_bare_remote() -> (TempDir, String)`.

**Step 2: Extend `project.rs`**

```rust
pub fn create_from_clone(db: &Db, git_url: &str, name: Option<String>) -> Result<Project> {
    let base = dirs::home_dir().unwrap_or_default().join(".dazero/projects");
    std::fs::create_dir_all(&base)?;
    let derived_name = name.clone().unwrap_or_else(|| {
        git_url.rsplit('/').next().unwrap_or("project").trim_end_matches(".git").to_string()
    });
    let dest = base.join(&derived_name);
    if dest.exists() {
        return Err(anyhow::anyhow!("target directory already exists: {}", dest.display()));
    }
    let status = std::process::Command::new("git")
        .args(["clone", git_url, dest.to_str().unwrap()])
        .status().context("invoke git clone")?;
    if !status.success() {
        return Err(anyhow::anyhow!("git clone failed with status {status}"));
    }
    create_from_folder(db, &dest, Some(derived_name))
}
```

**Step 3: Wire in `api.rs`**

```rust
CreateProject::Clone { git_url, name } => {
    project::create_from_clone(&state.db, &git_url, name)?
}
```

**Step 4:** Test, fmt, clippy, commit: `feat(api): project clone mode via git CLI`.

---

## Task 4: Projects — list/get/patch/delete

**Files:** `project.rs`, `api.rs`, `tests/projects_api.rs`.

Add functions `list`, `get`, `update`, `delete` in `project.rs`. Add routes:

- `GET  /api/projects` → `Vec<Project>`
- `GET  /api/projects/:id` → `Project`
- `PATCH /api/projects/:id` → updated `Project`
- `DELETE /api/projects/:id` → `204 No Content`

**Tests (add to same file):**

```rust
#[tokio::test]
async fn list_contains_created_project() { /* create 2, GET /api/projects, assert count >= 2, names present */ }

#[tokio::test]
async fn delete_project_cascades() {
    // Create project → get canvas_id → DELETE project → GET /api/canvases/:canvas_id → 404
}
```

(Note: the GET canvas endpoint arrives in Task 5; write this test's implementation in Task 5 or defer that assertion with a placeholder.)

Commit: `feat(api): projects list/get/patch/delete`.

---

## Task 5: Canvas state endpoints

**Files:**
- Create: `crates/dazero/src/canvas.rs`
- Modify: `api.rs`
- Test: `crates/dazero/tests/canvas_api.rs`

**Endpoints:**
- `GET /api/canvases/:id` → `{ id, project_id, viewport: {x,y,zoom}, nodes: [...], task_lists: [...] }`
- `PATCH /api/canvases/:id/viewport` → `{x,y,zoom}`

Write integration test first. Then `canvas.rs` with `get_full`, `update_viewport`. Wire in `api.rs`.

Commit: `feat(api): canvas viewport GET/PATCH`.

---

## Task 6: Node CRUD endpoints

**Files:** `canvas.rs`, `api.rs`, `tests/canvas_api.rs`.

Functions `create_node`, `update_node`, `delete_node`. Routes:
- `POST /api/canvases/:id/nodes`
- `PATCH /api/nodes/:id`
- `DELETE /api/nodes/:id`

Two integration tests: create a terminal-kind node, verify it appears in `GET /api/canvases/:id`; update position, verify; delete, verify.

Commit: `feat(api): canvas node CRUD`.

---

## Task 7: Task-list & tasks endpoints

**Files:**
- Create: `crates/dazero/migrations/V2__add_task_lists.sql` (SQL from schema section)
- Modify: `canvas.rs` or new `task_list.rs`
- Modify: `api.rs`
- Test: `tests/task_list_api.rs`

When a `task_list` node is created via `POST /api/canvases/:id/nodes`, the handler also creates a row in `task_lists` with the same node_id. Tasks are added via `POST /api/task-lists/:id/tasks`.

Routes:
- `POST   /api/task-lists/:id/tasks`
- `PATCH  /api/tasks/:id`
- `DELETE /api/tasks/:id`

`GET /api/canvases/:id` now also returns `task_lists` with embedded tasks.

Test: create task_list node → add 3 tasks → GET canvas → all 3 tasks present with `position` 0,1,2 and `status=pending`. Patch middle task to `done` → verify.

Commit: `feat(api): task-list manual checklist CRUD`.

---

## Task 8: PtyRegistry + per-agent WebSocket

**Files:**
- Modify: `crates/dazero/src/pty.rs` (add `PtyRegistry`)
- Modify: `crates/dazero/src/ws.rs` (new handler keyed by id)
- Modify: `api.rs` (POST /api/agents)
- Modify: `http.rs` (pass registry in state)
- Test: `tests/agents_api.rs`

**`PtyRegistry`:**

```rust
use dashmap::DashMap;
use std::sync::Arc;

pub struct PtyRegistry {
    sessions: DashMap<uuid::Uuid, Arc<PtySession>>,
}

impl PtyRegistry {
    pub fn new() -> Arc<Self> { Arc::new(Self { sessions: DashMap::new() }) }
    pub fn spawn(&self, cwd: Option<std::path::PathBuf>) -> Result<uuid::Uuid> {
        let sess = Arc::new(PtySession::spawn_shell(cwd)?);
        let id = sess.id;
        self.sessions.insert(id, sess);
        Ok(id)
    }
    pub fn get(&self, id: uuid::Uuid) -> Option<Arc<PtySession>> {
        self.sessions.get(&id).map(|r| r.clone())
    }
    pub fn remove(&self, id: uuid::Uuid) { self.sessions.remove(&id); }
}
```

Add `dashmap` to workspace deps.

**WS handler:**

```rust
// in ws.rs
pub async fn pty_by_id_handler(
    axum::extract::Path(id): axum::extract::Path<String>,
    State(state): State<ApiState>,
    ws: WebSocketUpgrade,
) -> Response {
    let uuid = match uuid::Uuid::parse_str(&id) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, "bad uuid").into_response(),
    };
    let sess = match state.pty_registry.get(uuid) {
        Some(s) => s,
        None => return (StatusCode::NOT_FOUND, "agent not found").into_response(),
    };
    ws.on_upgrade(move |socket| pty_socket_with_session(socket, sess))
}
```

**`POST /api/agents`:**

```rust
async fn create_agent(
    State(state): State<ApiState>,
    Json(body): Json<CreateAgent>,
) -> Result<Json<serde_json::Value>, AppError> {
    let cwd = body.cwd.map(std::path::PathBuf::from);
    let id = state.pty_registry.spawn(cwd)?;
    Ok(Json(serde_json::json!({ "agent_id": id.to_string() })))
}
```

Keep the old `/ws/pty` (without id) to not break the M1 test. Register both routes.

Test: POST /api/agents with cwd=temp → get id → connect `ws://.../ws/pty/{id}` → send `echo hi\n` → receive `hi`.

Commit: `feat(pty): agent registry with per-id WebSocket`.

---

## Task 9: Agent lifecycle cleanup

**Files:** `api.rs`, `ws.rs`, `tests/agents_api.rs`.

Endpoint `DELETE /api/agents/:id` → removes from registry (this drops the `Arc<PtySession>`; the PTY file descriptors close; reader thread exits with EOF).

Also: when the WebSocket disconnects, we DON'T auto-remove the session — the client may reconnect during the same dazero run. That mirrors the M3 tmux behavior we'll implement later.

Test: POST /api/agents → DELETE → try to connect WS → expect 404.

Commit: `feat(api): DELETE /api/agents removes session`.

---

## Task 10: Unified error responses

**Files:** `api.rs`, tests.

Current `AppError` always returns 500 — refine so common cases map to useful codes:
- `NotFound` → 404
- `BadRequest` → 400 (e.g., invalid UUID, missing required field)
- `Conflict` → 409 (e.g., project path already exists)
- Default → 500

Refactor `AppError` to carry an explicit status. Update handlers to construct typed errors.

Response body shape: `{ "error": "<message>", "code": "<slug>" }`.

Update existing tests that check `404` / `400` to confirm the JSON body shape.

Commit: `refactor(api): unified error responses with typed status codes`.

---

## Task 11: End-to-end integration test

**Files:** `crates/dazero/tests/e2e.rs`.

```rust
#[tokio::test]
async fn full_flow_create_project_spawn_agent_ws() {
    let (addr, _tmp) = spawn_test_daemon().await;
    let client = reqwest::Client::new();

    // 1. Create project from temp folder
    let tmp_proj = tempfile::TempDir::new().unwrap();
    let p: serde_json::Value = client.post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({ "mode": "folder", "path": tmp_proj.path() }))
        .send().await.unwrap().json().await.unwrap();

    // 2. Create a terminal node
    let node: serde_json::Value = client.post(format!("http://{addr}/api/canvases/{}/nodes", p["canvas_id"].as_str().unwrap()))
        .json(&serde_json::json!({
            "kind": "terminal",
            "position_x": 100.0, "position_y": 100.0,
            "data": {}
        }))
        .send().await.unwrap().json().await.unwrap();

    // 3. Spawn agent with the project cwd
    let agent: serde_json::Value = client.post(format!("http://{addr}/api/agents"))
        .json(&serde_json::json!({
            "project_id": p["id"], "node_id": node["id"],
            "cwd": p["path"]
        }))
        .send().await.unwrap().json().await.unwrap();

    // 4. Connect WS and verify shell cwd == project path
    let ws_url = format!("ws://{addr}/ws/pty/{}", agent["agent_id"].as_str().unwrap());
    let (mut ws, _) = tokio_tungstenite::connect_async(ws_url).await.unwrap();
    use futures_util::{SinkExt, StreamExt};
    ws.send(tokio_tungstenite::tungstenite::Message::Binary("pwd\n".into())).await.unwrap();

    // Collect output for 3s, assert it contains the project path
    let mut out = Vec::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(3);
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => break,
            msg = ws.next() => match msg {
                Some(Ok(tokio_tungstenite::tungstenite::Message::Binary(b))) => {
                    out.extend_from_slice(&b);
                    if String::from_utf8_lossy(&out).contains(p["path"].as_str().unwrap()) { break; }
                }
                _ => break,
            }
        }
    }
    assert!(String::from_utf8_lossy(&out).contains(p["path"].as_str().unwrap()));
}
```

Commit: `test(e2e): full project→canvas→agent→WS happy path`.

---

## Task 12: React Router + app shell

**Files:**
- Modify: `ui/package.json` (add `react-router-dom`, `reactflow`)
- Modify: `ui/src/main.tsx` (wrap with `BrowserRouter`)
- Modify: `ui/src/App.tsx` (routes)
- Create: `ui/src/Dashboard/Dashboard.tsx` (placeholder)
- Create: `ui/src/CanvasView/CanvasView.tsx` (placeholder)

**Steps:**

1. `cd ui && bun add react-router-dom@6 reactflow@11`.
2. `main.tsx`:
   ```tsx
   import { BrowserRouter } from "react-router-dom";
   // wrap <App /> with <BrowserRouter>
   ```
3. `App.tsx`:
   ```tsx
   import { Routes, Route, Navigate } from "react-router-dom";
   import { Dashboard } from "./Dashboard/Dashboard";
   import { CanvasView } from "./CanvasView/CanvasView";

   export function App() {
     return (
       <Routes>
         <Route path="/" element={<Dashboard />} />
         <Route path="/projects/:id" element={<CanvasView />} />
         <Route path="*" element={<Navigate to="/" replace />} />
       </Routes>
     );
   }
   ```
4. `Dashboard.tsx` placeholder: `<main>Dashboard placeholder</main>`.
5. `CanvasView.tsx` placeholder: `<main>Canvas for project {id}</main>` reading `useParams<{id:string}>()`.
6. `bun run typecheck && bun run build` clean.

Commit: `feat(ui): add router with dashboard and canvas routes`.

---

## Task 13: Typed API client

**Files:** `ui/src/lib/api.ts`, `ui/src/types.ts`.

```ts
// types.ts
export type Project = {
  id: string; name: string; path: string;
  git_remote: string | null;
  created_at: number;
  last_opened_at: number | null;
  canvas_id: string;
};
export type NodeKind = "terminal" | "task_list";
export type CanvasNode = {
  id: string; canvas_id: string; kind: NodeKind;
  position_x: number; position_y: number;
  width: number | null; height: number | null;
  data: unknown;
};
export type Task = { id: string; description: string; status: "pending"|"done"; position: number };
export type TaskList = { id: string; node_id: string; title: string | null; tasks: Task[] };
export type CanvasFull = {
  id: string; project_id: string;
  viewport: { x:number; y:number; zoom:number };
  nodes: CanvasNode[];
  task_lists: TaskList[];
};
```

```ts
// api.ts
import type { Project, CanvasFull, CanvasNode, Task } from "../types";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

export const api = {
  projects: {
    list: () => req<Project[]>("GET", "/api/projects"),
    get: (id: string) => req<Project>("GET", `/api/projects/${id}`),
    createFolder: (path: string, name?: string) =>
      req<Project>("POST", "/api/projects", { mode: "folder", path, name }),
    createClone: (git_url: string, name?: string) =>
      req<Project>("POST", "/api/projects", { mode: "clone", git_url, name }),
    update: (id: string, body: Partial<Pick<Project, "name"|"last_opened_at">>) =>
      req<Project>("PATCH", `/api/projects/${id}`, body),
    delete: (id: string) => req<void>("DELETE", `/api/projects/${id}`),
  },
  canvas: {
    get: (id: string) => req<CanvasFull>("GET", `/api/canvases/${id}`),
    patchViewport: (id: string, v: { x:number; y:number; zoom:number }) =>
      req<void>("PATCH", `/api/canvases/${id}/viewport`, v),
    createNode: (canvas_id: string, body: Partial<CanvasNode>) =>
      req<CanvasNode>("POST", `/api/canvases/${canvas_id}/nodes`, body),
    updateNode: (id: string, body: Partial<CanvasNode>) =>
      req<CanvasNode>("PATCH", `/api/nodes/${id}`, body),
    deleteNode: (id: string) => req<void>("DELETE", `/api/nodes/${id}`),
  },
  tasks: {
    create: (task_list_id: string, description: string, position: number) =>
      req<Task>("POST", `/api/task-lists/${task_list_id}/tasks`, { description, position }),
    update: (id: string, body: Partial<Pick<Task,"description"|"status">>) =>
      req<Task>("PATCH", `/api/tasks/${id}`, body),
    delete: (id: string) => req<void>("DELETE", `/api/tasks/${id}`),
  },
  agents: {
    spawn: (project_id: string, node_id: string, cwd?: string) =>
      req<{ agent_id: string }>("POST", "/api/agents", { project_id, node_id, cwd }),
    delete: (id: string) => req<void>("DELETE", `/api/agents/${id}`),
  },
};
```

Commit: `feat(ui): typed REST API client`.

---

## Task 14: Dashboard list view

**Files:** `ui/src/Dashboard/Dashboard.tsx`, `ui/src/Dashboard/ProjectCard.tsx`.

- Fetches `api.projects.list()` on mount.
- Renders sidebar list + main area "empty state" ("No projects yet — create your first one").
- Each `ProjectCard` is clickable (`navigate(`/projects/${id}`)`), shows name, path, last opened.
- Top-right button "+ New project" → opens wizard (Task 15).

Minimal styling: dark theme matching M1. No CSS framework, use inline styles or a small CSS module. Keep styles terse.

Commit: `feat(ui): dashboard project list`.

---

## Task 15: NewProjectWizard (folder + clone modes)

**Files:** `ui/src/Dashboard/NewProjectWizard.tsx`.

Modal dialog with tabs "Folder" / "Clone URL".
- Folder tab: text input for absolute path + optional "Pick folder" button (uses `window.showDirectoryPicker()` if supported, fallback to manual input). Save → `api.projects.createFolder`.
- Clone tab: text input for Git URL + optional name field. Save → `api.projects.createClone`.

On success: close modal, refresh list, navigate to the new project's canvas.

Commit: `feat(ui): new project wizard with folder and clone modes`.

---

## Task 16: CanvasView skeleton with React Flow

**Files:** `ui/src/CanvasView/CanvasView.tsx`, `ui/src/CanvasView/Toolbar.tsx`, `ui/src/store/canvasStore.ts`.

**`canvasStore.ts`** — Zustand store with `nodes`, `edges`, `viewport`, actions `setNodes`, `addNode`, `updateNode`, `deleteNode`.

**`CanvasView.tsx`:**
- On mount, read `:id` from route param, call `api.projects.get(id)`, then `api.canvas.get(project.canvas_id)`.
- Render `<ReactFlow>` with nodes from store, using the built-in `Background`, `Controls`, `MiniMap`.
- Register `nodeTypes = { terminal: TerminalNode, task_list: TaskListNode }` (both still placeholders for now — Tasks 17 and 18).
- On viewport change, debounced (500ms), call `api.canvas.patchViewport`.
- Toolbar top-left: two buttons "+ Terminal", "+ Task list" that call `api.canvas.createNode` then `addNode` in store.

Placeholder node components render a colored box with the kind label until Tasks 17-18 implement them.

Commit: `feat(ui): canvas view skeleton with React Flow`.

---

## Task 17: TerminalNode custom node

**Files:** `ui/src/CanvasView/nodes/TerminalNode.tsx`.

A resizable React Flow node containing an xterm.js instance. On mount:
1. If `node.data.agent_id` is null, call `api.agents.spawn(project_id, node_id, cwd=project.path)`, persist the returned `agent_id` via `api.canvas.updateNode(id, { data: { agent_id } })`.
2. Open WebSocket to `/ws/pty/${agent_id}`.
3. Render xterm, bridge I/O exactly as M1's `Terminal.tsx`.

Also: node header with a label (project path truncated), a close (×) button that calls `api.agents.delete` + `api.canvas.deleteNode`.

Use `NodeResizer` from `@reactflow/node-resizer` or the built-in resize handle (react-flow 11 has a resizer component).

Commit: `feat(ui): TerminalNode wrapping xterm.js`.

---

## Task 18: TaskListNode custom node

**Files:** `ui/src/CanvasView/nodes/TaskListNode.tsx`.

Node rendering a checklist:
- Title (editable in place).
- List of tasks with checkbox (status) + text (description, editable on click).
- "+" button at the bottom to add a task (calls `api.tasks.create`).
- "×" per task to delete.
- Drag-and-drop to reorder (optional in M2 — otherwise just "position" via order of insertion).

Commit: `feat(ui): TaskListNode with inline checklist`.

---

## Task 19: Viewport & node position persistence

**Files:** `ui/src/CanvasView/CanvasView.tsx`, `ui/src/store/canvasStore.ts`.

- On React Flow's `onNodeDragStop`, call `api.canvas.updateNode(id, { position_x, position_y })`.
- On node resize stop (if resizer used), call `api.canvas.updateNode(id, { width, height })`.
- On viewport change, debounce 500ms → `api.canvas.patchViewport`.

Test manually: drag a node, refresh the page — node is in the same position.

Commit: `feat(ui): persist viewport and node positions`.

---

## Task 20: UI delete/rename/delete-node

**Files:** `ui/src/CanvasView/CanvasView.tsx`, context menus.

- Right-click on empty canvas → "+ Terminal", "+ Task list".
- Right-click on a node → "Delete", "Rename" (for task-list only).
- Keyboard: Delete/Backspace on selected node → delete (call API + store).

Commit: `feat(ui): context menu and keyboard shortcuts for node ops`.

---

## Task 21: M2 end-to-end acceptance

**Manual checklist:**

- [ ] `cargo test --all --locked` passes all tests (M1 + M2).
- [ ] `cd ui && bun run typecheck && bun run build` clean.
- [ ] `cargo run --release -p dazero -- start` opens browser.
- [ ] Dashboard shows empty state; "+ New project" works for both folder and clone modes.
- [ ] Clicking a project opens `/projects/:id` and renders a React Flow canvas with working viewport (pan, zoom, minimap, controls).
- [ ] Toolbar "+ Terminal" adds a node with a live shell in the project's cwd. Running `pwd` inside it echoes the project path.
- [ ] Dragging 3 terminal nodes side-by-side: each is an independent shell.
- [ ] "+ Task list" adds a task-list node. Adding tasks, toggling status, deleting — all persist.
- [ ] Viewport and node positions survive a page reload.
- [ ] Deleting a project cascades: its canvas, nodes, and task-lists are gone.
- [ ] CI green (push a branch, see the workflow run).

Commit (touch nothing — just create a release candidate tag locally, don't push): `git tag v0.2.0-rc1`.

---

## Appendix — Key design notes

- **No parent→child edges yet.** A task-list doesn't automatically spawn an agent per task in M2. That's M3. The user can manually open a terminal node and start working.
- **Agents are in-memory only.** Killing the daemon kills all shells. That's acceptable for M2; M3 adds tmux detached persistence.
- **Sessions survive WebSocket disconnect during the same daemon run.** Reconnect to `/ws/pty/:id` keeps scrollback intact from the PTY's own buffer.
- **Project paths are absolute.** Never trust relative paths from the UI.
- **Git clone destinations** go to `~/.dazero/projects/<name>`. This keeps clones out of the user's workspace.
- **The React Flow viewport is a canvas state**, not per-user. In M2 we have a single user per daemon, so this is fine.

---

## Skills to use during execution

- `@superpowers:test-driven-development` for each task.
- `@superpowers:verification-before-completion` before marking complete.
- `@superpowers:systematic-debugging` if a test fails unexpectedly.
- `@superpowers:requesting-code-review` at the end of Task 21 before merging.
