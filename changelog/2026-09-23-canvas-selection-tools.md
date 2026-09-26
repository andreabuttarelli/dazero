# Canvas selection tools: duplicate, copy/paste, toolbar, common properties, connect

Working on the canvas meant one node at a time: no duplicate, no way to act on a selection beyond
deleting it, and a double-click menu that duplicated the add bar.

## What exists now

- **Duplicate / copy / paste** (⌘D, ⌘C, ⌘V). `planDuplicate` (`src/lib/canvas/duplicate-plan.ts`,
  pure) copies config and the edges internal to the selection, never run state or run history.
  Paste works across canvases of the same org. Every node and edge goes through the existing
  `createNode`/`createConnection`, so `canvas_events` records them like any other write.
- **Selection toolbar** driven by the `SELECTION_ACTIONS` table (`src/lib/canvas/selection-actions.ts`):
  the future "Create post" button is one more row, not new markup.
- **Common properties** for 2+ nodes (`commonPropertiesOf`): same / mixed / absent per field.
  A model change first runs `orphanedByModelChange` across the selection, which is wired here for
  the first time, and asks once. Writes go through a `batchWrite` action: N independent
  optimistic-concurrency writes, where a conflict is reported per node and never silently skipped.
- **Connect selection → new / existing node** (`planConnectSelection`, pure, reusing
  `connectorsFor`/`isListValued`). Incompatible sources and occupied single-valued ports are named
  to the user. The `connect` action now accepts `target_handle`: before this, every wire landed
  with a null handle, so a wire could not say which typed port it went to.
- The double-click menu is gone (`create-menu.test.ts` with it). Nodes are created from the add bar
  and the number keys.

## Not done

Client-side undo (⌘Z) is still not wired: `undo-plan.ts` has the pure logic, but no UI uses it.
Every gesture lands in `canvas_events`, so a ⌘Z stack can be built on top of it.
