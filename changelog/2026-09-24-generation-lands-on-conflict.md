# A finished render lands even after a mid-run write

**Before:** `land()` wrote the result with the version read at click time. Any write during the
render (the "Sblocca" button, a drag that saves data, another tab) bumped `nodes.version`, the
write matched zero rows and the result was dropped: `node_runs` said `done`, the file sat in
Storage, the node had no `refId`. Seen live on a 67 s qwen3-pro render unlocked at second 23.

**Now:** `land()` uses `writeNodeDataRetrying`, the same reread-and-merge `giveUp` already used,
and only sets `running`, `runId`, `refId`, `error` on top of whatever the node holds, so the
concurrent write survives too.

Test: `un giro riuscito arriva sul nodo anche se la versione è cambiata nel frattempo`.
