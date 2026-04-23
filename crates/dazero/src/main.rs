// crates/dazero/src/main.rs
use anyhow::Result;
use clap::Parser;
use dazero::cli::{Cli, Command};

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("dazero=info,axum=info")),
        )
        .init();

    let cli = Cli::parse();
    match cli.command {
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
                let db_path = dirs::home_dir()
                    .unwrap_or_default()
                    .join(".dazero/dazero.db");
                dazero::http::serve_with_db(port, db_path).await
            })?;
            Ok(())
        }
        Some(Command::Doctor) => {
            println!("dazero {}", env!("CARGO_PKG_VERSION"));
            match std::process::Command::new("tmux").arg("-V").output() {
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
        None => {
            // Default behaviour: show help
            let mut cmd = <Cli as clap::CommandFactory>::command();
            cmd.print_help()?;
            println!();
            Ok(())
        }
    }
}
