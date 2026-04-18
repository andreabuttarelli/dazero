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
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("openpty failed")?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }
        // Ensure TERM is set
        cmd.env(
            "TERM",
            std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()),
        );

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
        })
        .await??;
        Ok(())
    }

    pub async fn read_some(&self) -> Result<Vec<u8>> {
        let mut rx = self.rx.lock().await;
        rx.recv().await.context("pty channel closed")
    }
}
