# A text node can feed another text node

`graph.ts::CANVAS_NODE_SPECS.text` had `generated: false` — the entry written for a
node that never generates, like `media`/`document`/`iframe`. Text nodes are not that:
`gen-node.ts::GEN_MEDIUMS` includes `text`, `connectors.ts::connectorsFor('text', …)`
gives it a `text` port, and `generate.ts::depositText` lands its output on an asset —
text is a full generative node, same as image and video. But `canConnect` read
`generated: false` and refused every arc INTO a text node before the connector/port
logic ever ran: `isValidConnection` (`CanvasFlow.svelte`) calls `verdictBetween` →
`canConnect` first, so a text node with generated output could never be wired into a
second text node, or any other text target.

## What changed

`text`'s spec is now `{ generated: true, accepts: ['text'], requires: [] }`. `requires`
stays empty — unlike image/video, a text node doesn't need an upstream text input to
run; the user's own `data.prompt` is enough. `accepts: ['text']` is what makes A → B
legal now.

**The payload side had the matching gap.** `upstream.ts::sourceText` read only
`asset?.content` — the last generated run's output via `data.refId`. A text node that
had never been run (no `refId`, no asset) gave `null`, which `resolveUpstreamInputs`
correctly treats as "nothing to give" and excludes from the prompt — silently dropping
a node whose prompt was sitting right there in `data.prompt`. Fixed to fall back to
`data.prompt` when there's no generated asset: generated output wins when it exists,
the user's own prompt otherwise. Image and video targets get the same fallback for
free, since they read the same `text` field.

**One stale test asserted the old contradiction.** `graph.test.ts`'s iframe suite
already documented "«riassumi questa pagina»" (summarize this page) as the whole point
of letting an iframe feed a text node, then asserted `canConnect(iframe, text).ok ===
false` two lines below — the comment and the assertion disagreed even before this fix.
Corrected to `true`.

Traced end to end: drag in `CanvasFlow.svelte` → `isValidConnection` →
`verdictBetween` (`connect-rules.ts`) → `canConnect` (`graph.ts`) → `onConnected` →
`connect` form action (`+page.server.ts`) → `createConnection` (`repos/canvas.ts`) →
row in `nodes_connections` → on generate, `upstreamInputsFor` (`upstream.ts`) →
`toUpstreamNode` → `sourceText` → `resolveUpstreamInputs` (`upstream-inputs.ts`) picks
it up as a `text` connector input.

No server-side re-validation exists today: the `connect` form action never called
`canConnect`, so this was purely a client-side false refusal — nothing to loosen on
the server.
