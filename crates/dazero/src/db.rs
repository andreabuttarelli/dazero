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
    migrations::runner()
        .run(&mut conn)
        .context("run migrations")?;
    Ok(Arc::new(Mutex::new(conn)))
}
