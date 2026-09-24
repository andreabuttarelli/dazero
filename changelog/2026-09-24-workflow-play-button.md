# Workflow of connected nodes — phase 2: Play button

Phase 2 of "run a chain of connected generative nodes server-side" (phase 1:
`2026-09-24-workflow-plan-and-queue.md`). Wires the existing planner/queue to the canvas UI.

## Wired

- `src/lib/canvas/selection-actions.ts` — new `run-workflow` action, gated by
  `planWorkflow`'s verdict instead of a second connectivity check; its `reason` becomes the
  button's tooltip when disabled.
- `src/lib/components/canvas/SelectionToolbar.svelte` / `CanvasFlow.svelte` — pass `edges`
  through to `enabledFor`, new `onRunWorkflow` prop, `SELECTION_RUN['run-workflow']`.
- `+page.svelte` — `runWorkflow(ids)`: `workflow_plan` for the preventivo, `confirm()` (same
  native dialog `runLoop` uses), `run_workflow` to enqueue, optimistic `startRun`/`unlockRun`
  on the selected nodes exactly like `run()` does for a single node. A floating chip
  ("Flusso in corso · Ferma") shows while any of the workflow's nodes is still running, and
  clears itself once none is — `cancel_workflow` on click.
- `post()` now accepts `string[]` field values (appended, not set) so `node_id` can repeat —
  `workflow_plan`/`run_workflow` read it with `formData.getAll`.

## Left

MCP `run_workflow` tool, still gated on `run_node_loop` existing in `cli/mcp/tools/nodes.ts`.
