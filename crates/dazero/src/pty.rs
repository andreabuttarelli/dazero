use anyhow::{Context, Result};
use dashmap::DashMap;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::task;

/// Una sessione PTY con shell figlio.
/// I byte in arrivo dalla shell sono disponibili via `read_some()`.
pub struct PtySession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    rx: Arc<tokio::sync::Mutex<mpsc::UnboundedReceiver<Vec<u8>>>>,
    pub id: uuid::Uuid,
    pub tmux_session: String,
}

impl PtySession {
    /// Spawna una shell interattiva (`$SHELL` o `/bin/bash`) con cwd opzionale,
    /// wrapped in a detached tmux session for persistence across daemon restarts.
    pub fn spawn_shell(cwd: Option<PathBuf>) -> Result<Self> {
        let id = uuid::Uuid::new_v4();
        let tmux_session = format!("dazero-{id}");

        // 1. Create detached tmux session with the user's shell.
        //    NOTE: `-c start-directory` MUST appear before the shell command in
        //    tmux's argument list; placing it after would pass it to the shell
        //    itself (e.g. `zsh -c /path` executes the path as a script).
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut new_cmd = std::process::Command::new("tmux");
        new_cmd.args([
            "new-session",
            "-d",
            "-s",
            &tmux_session,
            "-x",
            "200",
            "-y",
            "50",
        ]);
        if let Some(ref d) = cwd {
            new_cmd.args(["-c"]).arg(d);
        }
        new_cmd.arg(&shell);
        let out = new_cmd.output().context("tmux new-session")?;
        if !out.status.success() {
            return Err(anyhow::anyhow!(
                "tmux new-session failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }

        // 2. Attach from inside a PTY we own.
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("openpty failed")?;

        let mut cmd = CommandBuilder::new("tmux");
        cmd.args(["attach-session", "-t", &tmux_session]);
        cmd.env(
            "TERM",
            std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()),
        );
        let _child = pair.slave.spawn_command(cmd).context("tmux attach spawn")?;
        drop(pair.slave);

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
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(?e, "pty read error");
                        break;
                    }
                }
            }
        });

        Ok(PtySession {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            rx: Arc::new(tokio::sync::Mutex::new(rx)),
            id,
            tmux_session,
        })
    }

    /// Internal constructor for reconnecting to an existing tmux session.
    /// Task 3 will use this.
    pub fn attach_existing(id: uuid::Uuid, tmux_session: String) -> Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        let mut cmd = CommandBuilder::new("tmux");
        cmd.args(["attach-session", "-t", &tmux_session]);
        cmd.env(
            "TERM",
            std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()),
        );
        let _child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);
        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;
        let (tx, rx) = mpsc::unbounded_channel::<Vec<u8>>();
        task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(PtySession {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            rx: Arc::new(tokio::sync::Mutex::new(rx)),
            id,
            tmux_session,
        })
    }

    /// Resize the PTY so the inner program (shell, claude-code, vim...) sees
    /// the correct `$COLUMNS`/`$LINES` and redraws accordingly.
    /// Note: Task 10 adds tmux resize-window propagation. For now, resize only
    /// affects the PTY (the tmux-attach one), not tmux's window size.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let master = self.master.lock().unwrap();
        master
            .resize(PtySize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("pty resize")?;
        Ok(())
    }

    pub async fn write(&self, bytes: &[u8]) -> Result<()> {
        let writer = self.writer.clone();
        let bytes = bytes.to_vec();
        task::spawn_blocking(move || {
            let mut w = writer.lock().unwrap();
            w.write_all(&bytes).context("pty write")?;
            w.flush().ok();
            Ok::<_, anyhow::Error>(())
        })
        .await??;
        Ok(())
    }

    pub async fn read_some(&self) -> Result<Vec<u8>> {
        let mut rx = self.rx.lock().await;
        rx.recv().await.context("pty channel closed")
    }

    /// Kill the underlying tmux session. Called by `PtyRegistry::remove` to
    /// clean up after agent deletion.
    pub fn kill_tmux_session(&self) {
        let _ = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &self.tmux_session])
            .status();
    }
}

/// Registry of live PTY sessions keyed by UUID.
pub struct PtyRegistry {
    sessions: DashMap<uuid::Uuid, Arc<PtySession>>,
}

impl PtyRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            sessions: DashMap::new(),
        })
    }

    /// Spawn a new shell session with optional cwd, register it, and return its UUID.
    pub fn spawn(&self, cwd: Option<PathBuf>) -> Result<uuid::Uuid> {
        let sess = Arc::new(PtySession::spawn_shell(cwd)?);
        let id = sess.id;
        self.sessions.insert(id, sess);
        Ok(id)
    }

    /// Look up a session by UUID.
    pub fn get(&self, id: uuid::Uuid) -> Option<Arc<PtySession>> {
        self.sessions.get(&id).map(|r| r.clone())
    }

    /// Remove a session from the registry, killing its tmux session.
    pub fn remove(&self, id: uuid::Uuid) {
        if let Some((_, sess)) = self.sessions.remove(&id) {
            sess.kill_tmux_session();
        }
    }

    /// Reattach to any tmux sessions named `dazero-*` that already exist on the host.
    /// Called once on daemon startup.
    pub fn recover(&self) -> Result<Vec<uuid::Uuid>> {
        let out = std::process::Command::new("tmux")
            .args(["list-sessions", "-F", "#S"])
            .output();
        let out = match out {
            Ok(o) if o.status.success() => o,
            _ => return Ok(vec![]), // no tmux server running, or no sessions
        };
        let mut recovered = Vec::new();
        for name in String::from_utf8_lossy(&out.stdout).lines() {
            let name = name.trim();
            let Some(rest) = name.strip_prefix("dazero-") else {
                continue;
            };
            let Ok(uuid) = uuid::Uuid::parse_str(rest) else {
                tracing::warn!(session = name, "skipping non-UUID dazero session");
                continue;
            };
            if self.sessions.contains_key(&uuid) {
                continue; // already tracked (shouldn't happen on first recover)
            }
            match PtySession::attach_existing(uuid, name.to_string()) {
                Ok(sess) => {
                    self.sessions.insert(uuid, Arc::new(sess));
                    recovered.push(uuid);
                    tracing::info!(session = %name, "recovered tmux session");
                }
                Err(e) => {
                    tracing::warn!(session = %name, error = ?e, "failed to reattach");
                }
            }
        }
        Ok(recovered)
    }

    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

impl Default for PtyRegistry {
    fn default() -> Self {
        Self {
            sessions: DashMap::new(),
        }
    }
}
