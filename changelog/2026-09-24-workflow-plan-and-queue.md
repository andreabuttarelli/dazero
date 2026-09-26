# Workflow of connected nodes — phase 1: planner + queue, no UI

Phase 1 of "run a chain of connected generative nodes server-side". Pure planner, queue,
server actions, tests. Play button is phase 2.

## What this reuses, not builds again

Reuses the loop queue's exact pattern (`src/lib/server/canvas/loop.ts`), no second engine:

- A queued step is a `node_runs` row, `status = 'running'`, with `params.workflow = { phase:
  'queued', workflowId, dependsOn, … }` — the same trick `LoopTicket`/`params.loop` uses. No
  migration.
- `claimRun`/`completeRun`/`failRun`/`runningRuns` from `repos/node-runs.ts`, unchanged.
- `runGenNode` from `generate.ts` is the only thing that ever generates — a workflow step calls
  it exactly like a loop combination does.
- Drained from the same cron tick (`api/v1/canvas/runs/tick`), next to `drainLoopQueue`.

## New files

- `src/lib/canvas/workflow-plan.ts` — pure. `planWorkflow(selectedIds, edges, nodeTypesById)`
  validates (≥2 selected, all generative, one connected component ignoring direction, no cycle)
  and returns nodes in topological order with `dependsOn` restricted to selected nodes.
  `stepReadiness(dependsOnStatuses)` — `ready`/`waiting`/`blocked`, `blocked` on any
  `failed`/`expired` dependency.
- `src/lib/server/canvas/workflow.ts` — `enqueueWorkflow` plans and writes one ticket per step,
  marking each node's `running` flag (mirrors what `giveUp`/`runGenNode` do, since it isn't
  exported from `generate.ts`). `drainWorkflowQueue` reads each queued ticket's dependency run
  statuses, runs ready steps through `runGenNode`, fails blocked steps with `Fermato: <nodo> non
  è riuscito` without spending anything, and skips waiting ones — including a still-`running`
  video step, whose dependents unblock once `reconcileVideoNodeRuns` closes it on a later tick.
  `cancelWorkflow` cancels queued steps of one `workflowId`.

## Wired

- `api/v1/canvas/runs/tick/+server.ts` calls `drainWorkflowQueue` next to `drainLoopQueue`.
- `+page.server.ts` actions: `workflow_plan` (dry run, no writes), `run_workflow` (credit-gated,
  enqueues, returns `{ workflowId, steps, estimatedCredits }`), `cancel_workflow`.

## Left for phase 2

The Play button, any UI reading `steps`/`estimatedCredits`, MCP `run_workflow` (added only if
`run_node_loop` already exists in `cli/mcp/tools/nodes.ts` — it wasn't touched this round to
keep the diff to the planner/queue/actions).
