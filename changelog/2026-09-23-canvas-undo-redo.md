# Canvas undo/redo: wire what was already built

`src/lib/canvas/undo-plan.ts` (`checkGesture`, `inverseOf`) and the repo functions its inverses
need (`restoreNode`, `restoreConnection`) existed since the selection-tools work
(`2026-09-23-canvas-selection-tools.md` names this explicitly as "not done"). Nothing called them:
⌘Z did nothing on the canvas.

## What exists now

- **A server action, `undo`** (`+page.server.ts`). It parses the client's `UndoItem[]` into a
  `Gesture`, then `undoGesture` (`src/lib/server/canvas/undo.ts`) reads FRESH node/edge state —
  `findNode`/`listConnections` against the live database, not what the client last saw — runs
  `checkGesture` against it, and applies the resulting `InverseWrite[]` through the same repos as
  every other write: `writeNodeData`, `deleteNode`, `restoreNode`, `deleteConnection`,
  `restoreConnection`. Same optimistic concurrency on `nodes.version`, same soft-delete, same
  `canvas_events` row, attributed to the user who pressed the shortcut — an undo is not a separate
  protocol, it is an ordinary write whose inverse was already computed.
- **The other-user rule is enforced by construction, not by a special check.** Because
  `undoGesture` always re-reads state at apply time, a peer's realtime write — whether or not it
  has reached this client yet — is already reflected in what `checkGesture` compares against.
  A stale precondition (`node_changed_by_peer`, `node_deleted_by_peer`,
  `node_gained_peer_connections`, `edge_already_gone`) returns `fail(409, { reason })`; nothing is
  written, and the whole gesture is refused as one unit — never half-applied.
- **Redo needed a decision `undo-plan.ts` didn't make.** `checkGesture`'s writes bump
  `nodes.version`; naively re-submitting the original gesture as a "redo" would always conflict,
  because the version it remembers is now stale by one. `undoGesture` returns a `redo: Gesture`
  built from `expectedVersion + 1` on every `node.update` item (and `create`↔`delete` swapped on
  the others) — the exact gesture that, fed back into the same `undo` action, reapplies the
  original write. Both directions go through the one action; there is no separate `redo` endpoint.
- **The client stack, `src/lib/canvas/undo-stack.ts`.** Per-tab, in memory — two tabs of the same
  person have two different histories, which `undo-plan.ts`'s own docstring says is correct.
  `push`/`popUndo`/`popRedo` don't move a gesture to the opposite stack by themselves: that only
  happens after the server confirms, via `pushRedo`/`pushUndo` with the gesture the SERVER
  returned (see above — the one with the post-write version), never with the gesture just popped.
- **One gesture per user action**, even when it is several writes: `create`/`createFilled`
  (single `node.create`), `write` (`node.update`), `connect`/`disconnect` (single edge item),
  `remove` (N `node.delete` + cascading `edge.delete`, one gesture), `duplicate`/`paste` (N
  `node.create` + M `edge.create`), `connectNew`/`connectExisting` (node create if any + N wires),
  and `commonChange` — the common-properties batch, where a model change can drop wires
  (`orphanedByModelChange`) AND rewrite N nodes: both collapse into one gesture, so undoing it
  either restores everything or is refused as a whole, never a model reverted with wires still cut.
  `disconnect`/`connect` got a `pushGesture` escape hatch so a caller that already owns the
  combined gesture (like `commonChange`) can suppress the per-call push.
- **⌘Z / ⇧⌘Z in `shortcuts.ts`**, recognized before the `if (e.shiftKey) return null` that every
  other `mod`+key combo uses — `z` needed to branch on shift instead of being blocked by it.
  Executed by `CanvasKeys.svelte`, same wiring as every other canvas shortcut: never while typing
  (`isTypingTarget`), listed in `CANVAS_SHORTCUTS` so the shortcuts sheet shows it.

## Move/resize: undoable, but never through the server

Position is last-write-wins with no `canvas_events` row — `canvas.ts` and `undo-plan.ts` both
already said so in their own docstrings ("MAI `node.move`") before this pass, and that stays true:
no new event kind, no migration, `checkGesture`/`undoGesture` (the server side) never see a move.
Instead:

- **`src/lib/canvas/move-gesture.ts`**, pure, mirrors `undo-plan.ts`'s shape but asks its own
  question: not "does `nodes.version` still match" (there is no version) but "is the CURRENT
  position still what this gesture last set". `checkMoveGesture` reads that current position from
  whatever the caller hands it — in `+page.svelte`, that's `nodes`, which the existing realtime
  subscription already keeps fresh. If a peer dragged the same node since, the live position isn't
  `item.after` anymore: `stale`, reason `node_moved_by_peer` (or `node_deleted_by_peer`), and undo
  is skipped with "Annullamento saltato: …" — the same message shape as a server-side refusal, from
  a check that runs entirely in the browser. `buildMoveGesture` turns a drag-stop's node list into
  one `MoveGesture`, dropping any node whose position didn't actually change (a click SvelteFlow
  still reports as a drag).
- **`undo-stack.ts` became generic (`UndoStack<T>`)** so `+page.svelte` keeps ONE chronological
  stack of `StackEntry = { source: 'server'; gesture: Gesture } | { source: 'move'; gesture: MoveGesture }`
  — moving a node, then creating another, then two undos: the create goes first, the move second,
  in the order they happened. Two separate stacks would have gotten this order wrong.
- **Undoing a move is `move()` — the same server action a live drag already calls** — no new
  endpoint. A drag that moves N nodes together pushes ONE gesture (`onNodeDragStop` in
  `CanvasFlow.svelte` now reads the FULL set SvelteFlow reports, not just the node under the
  pointer — fixed as part of this, since only `targetNode` was ever persisted before, and an undo
  gesture is meaningless for a node whose "after" position was never written).
- **Resize stays unwired**, not because it's excluded on principle like before, but because no
  resize gesture exists in the product yet: `resizeNode` (`repos/canvas.ts`) has no caller anywhere
  in the UI. There is nothing to hook undo into until a resize handle exists.

`run`/`sync`/`restore` (gen-run history)/`share`/`unlock` remain out of scope: not gestures either
task asked for, and not in `undo-plan.ts`'s `GestureKind` union.

## Tests

`src/lib/server/canvas/undo.test.ts` calls the real `actions.undo` (not a mock of `undoGesture`)
for: a `node.create` undo (soft-delete), a `node.delete` undo (restore), a `node.update` undo
(writes `before` back with `expectedVersion + 1`), a combined `node.update` + `edge.delete` gesture
(model change that dropped wires — both undone together), two conflict cases (`node_changed_by_peer`,
`node_deleted_by_peer`) that assert NO write happens, `edge.create`/`edge.delete` undo, and the
`redo` gesture shape for both a `node.update` and a `node.create` undo. `src/lib/canvas/undo-stack.test.ts`
covers the generic stack in isolation. `src/lib/canvas/move-gesture.test.ts` covers
`checkMoveGesture` (ok, peer-moved, peer-deleted, a multi-node gesture refused whole when one node
is stale), `inverseMoveGesture`, and `buildMoveGesture` (single node, multi-node, no-op filtering,
missing-position filtering, empty input). `src/lib/canvas/shortcuts.test.ts` gained the ⌘Z/⇧⌘Z cases
plus the existing "doesn't fire while typing" and "doesn't collide with the global registry" suites.
