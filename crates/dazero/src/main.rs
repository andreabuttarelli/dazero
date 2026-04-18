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
        Some(Command::Start { port, no_open: _ }) => {
            let runtime = tokio::runtime::Runtime::new()?;
            runtime.block_on(dazero::http::serve(port))?;
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
