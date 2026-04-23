use std::time::Duration;
use tokio::net::TcpStream;

async fn spawn() -> (std::net::SocketAddr, tempfile::TempDir) {
    let tmp = tempfile::TempDir::new().unwrap();
    let db = tmp.path().join("test.db");
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let p = db.clone();
    tokio::spawn(async move {
        dazero::http::serve_with_db(port, p).await.unwrap();
    });
    for _ in 0..30 {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    (([127, 0, 0, 1], port).into(), tmp)
}

async fn make_canvas_with_two_nodes(addr: std::net::SocketAddr) -> (String, String, String) {
    let client = reqwest::Client::new();
    let proj_dir = tempfile::TempDir::new().unwrap();
    let proj: serde_json::Value = client
        .post(format!("http://{addr}/api/projects"))
        .json(&serde_json::json!({"mode":"folder","path":proj_dir.path(),"name":"e"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    std::mem::forget(proj_dir);
    let cid = proj["canvas_id"].as_str().unwrap().to_string();
    let a: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{cid}/nodes"))
        .json(&serde_json::json!({"kind":"task_list","position_x":0.0,"position_y":0.0,"data":{}}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let b: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{cid}/nodes"))
        .json(&serde_json::json!({"kind":"terminal","position_x":400.0,"position_y":0.0,"data":{}}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    (
        cid,
        a["id"].as_str().unwrap().to_string(),
        b["id"].as_str().unwrap().to_string(),
    )
}

#[tokio::test]
async fn create_and_list_edge() {
    let (addr, _tmp) = spawn().await;
    let (cid, src, tgt) = make_canvas_with_two_nodes(addr).await;
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "source_node_id": src, "target_node_id": tgt,
        "kind": "task_spawn", "label": "spawned"
    });
    let r = client
        .post(format!("http://{addr}/api/canvases/{cid}/edges"))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 201);
    let e: serde_json::Value = r.json().await.unwrap();
    assert_eq!(e["source_node_id"], src);
    assert_eq!(e["target_node_id"], tgt);
    assert_eq!(e["kind"], "task_spawn");

    let c: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{cid}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c["edges"].as_array().unwrap().len(), 1);
    assert_eq!(c["edges"][0]["id"], e["id"]);
}

#[tokio::test]
async fn delete_edge_removes_it() {
    let (addr, _tmp) = spawn().await;
    let (cid, src, tgt) = make_canvas_with_two_nodes(addr).await;
    let client = reqwest::Client::new();

    let e: serde_json::Value = client
        .post(format!("http://{addr}/api/canvases/{cid}/edges"))
        .json(&serde_json::json!({"source_node_id":src,"target_node_id":tgt}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let eid = e["id"].as_str().unwrap();

    let r = client
        .delete(format!("http://{addr}/api/edges/{eid}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 204);

    let c: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{cid}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c["edges"].as_array().unwrap().len(), 0);

    // Second delete → 404
    let r2 = client
        .delete(format!("http://{addr}/api/edges/{eid}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 404);
}

#[tokio::test]
async fn edge_cascades_on_node_delete() {
    let (addr, _tmp) = spawn().await;
    let (cid, src, tgt) = make_canvas_with_two_nodes(addr).await;
    let client = reqwest::Client::new();

    client
        .post(format!("http://{addr}/api/canvases/{cid}/edges"))
        .json(&serde_json::json!({"source_node_id":src,"target_node_id":tgt}))
        .send()
        .await
        .unwrap();

    // Delete the source node — the edge should go with it (FK cascade).
    client
        .delete(format!("http://{addr}/api/nodes/{src}"))
        .send()
        .await
        .unwrap();

    let c: serde_json::Value = client
        .get(format!("http://{addr}/api/canvases/{cid}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        c["edges"].as_array().unwrap().len(),
        0,
        "edge should cascade on node delete"
    );
}
