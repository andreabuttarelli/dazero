use dazero::db;
use tempfile::TempDir;

#[tokio::test]
async fn opens_and_migrates_sqlite() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("dazero.db");
    let conn = db::open(&path).expect("open");
    // Verify schema by querying sqlite_master
    let tables: Vec<String> = {
        let stmt = conn.lock().unwrap();
        let mut q = stmt
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        let rows = q.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.filter_map(Result::ok).collect()
    };
    assert!(
        tables.contains(&"projects".to_string()),
        "tables were {tables:?}"
    );
    assert!(tables.contains(&"canvases".to_string()));
    assert!(tables.contains(&"nodes".to_string()));
}

#[tokio::test]
async fn edges_table_exists_after_migration() {
    let tmp = tempfile::TempDir::new().unwrap();
    let path = tmp.path().join("dazero.db");
    let conn = dazero::db::open(&path).expect("open");
    let stmt = conn.lock().unwrap();
    let tables: Vec<String> = {
        let mut q = stmt
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        let rows = q.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.filter_map(Result::ok).collect()
    };
    assert!(tables.contains(&"edges".to_string()), "tables: {tables:?}");

    // Check the index too
    let mut q = stmt
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_edges_canvas'")
        .unwrap();
    let rows: Vec<String> = q
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .filter_map(Result::ok)
        .collect();
    assert_eq!(rows.len(), 1, "expected idx_edges_canvas");
}
