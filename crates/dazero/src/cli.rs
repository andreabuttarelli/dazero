// crates/dazero/src/cli.rs
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "dazero",
    version,
    about = "dazero — infinite canvas of real terminals for parallel AI agents"
)]
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
