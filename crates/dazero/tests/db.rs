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
