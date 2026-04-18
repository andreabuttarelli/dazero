// crates/dazero/src/ui_assets.rs
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../ui/dist/"]
pub struct Assets;
