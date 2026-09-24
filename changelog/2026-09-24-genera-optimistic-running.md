# Genera shows loading on click, not after a queued save resolves

Reported: several seconds pass between pressing "Genera" and the node showing its
loading state.

## Root cause

`run()` in `+page.svelte` already set `running: true` on `nodes` before the
`post('run', …)` request — that part looked optimistic. But it did so *after*
`await enqueue(id, async () => {})`, and `enqueue` (`write-queue.ts::createWriteQueue`)
is the same per-node write queue that `write()` uses for every `oninput` on the prompt
textarea (`GenNode.svelte`, no debounce: one `POST ?/write` queued per keystroke).
Typing a prompt and pressing Genera right after — the common case — queues the click
behind however many keystroke-saves are still in flight, each a real network
round-trip. The spinner only appeared once that backlog drained.

Measured with the real queue logic, 5 queued ~180ms writes ahead of the click:
spinner at **907ms** before the fix, **1ms** after.

## Fix

`running: true` is now set on `nodes` synchronously, before `enqueue` is even called.
The `enqueue` step still runs afterward and still gates the real `POST ?/run` — that
part stays, because it's what makes the server read the version written by a model
choice made a moment earlier (the 409-conflict protection is unrelated to when the
spinner shows). On a server refusal, the optimistic state rolls back via the new
`unlockRun`, then `refresh()` reconciles with the server's own `node.error`.

`gen-node.ts` gained `startRun` (sets `running: true`, clears `error`), the mirror of
the existing `unlockRun`. Server-side ordering in `generate.ts::runGenNode` was
already correct — `running: true` is its very first database write, before the
credits gate, `upstreamInputsFor`, or any model call — so no server change was needed;
the delay was entirely a client queuing artifact.

## Test

`gen-node.test.ts` — `startRun` sets `running`/clears `error`, and
`unlockRun(startRun(node))` round-trips back to the pre-click state.
