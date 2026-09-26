# A wired upstream text now counts as a node's prompt

An image or video node with an empty prompt of its own, wired to a text or doc
node, said "Scrivi cosa vuoi" and refused to run — even though the upstream
node had something to say. `runStateOf`/`hasPrompt` in `gen-node.ts` already
had the right rule (own prompt, or an upstream text availability flag) but
nothing fed it real data: `GenNode.svelte` always passed
`hasUpstreamText: false`, and `gen-history.ts`'s `blockedReason`/`canStartRun`
took no upstream argument at all.

## What changed

`upstream-inputs.ts` gained `hasUpstreamText(nodes, edges, targetId)`: the
same `resolveUpstreamInputs` the server uses, asked with a text-only
modality (text is always an open connector, so no model lookup is needed
client-side). The canvas page (`+page.server.ts`'s sibling `+page.svelte`)
computes `hasUpstreamTextByNode` from its own `nodes`/`edges`, using a
`sourceTextOf` that mirrors `upstream.ts::sourceText` — generated output when
the source already ran, its own prompt/`data.content` otherwise — and passes
it into every `GenNode`. `gen-history.ts::blockedReason`/`canStartRun` now
take that flag too, so the Genera button, the "Scrivi cosa vuoi"/"Pronto"
label, and the state machine all agree.

Server-side, `generate.ts::refuse` rejected `prompt_required` on
`input.prompt` alone, before `upstreamInputsFor` had even been asked — the
same defect, one layer down. The check moved to after the upstream read,
against the same composed `[...upstream.text, input.prompt]` string
`runGenNode` already builds for the real render. One path
(`runGenNode`) serves the canvas button, the MCP `run_node_generation`
endpoint, and the loop — fixing it once fixes all three.

Applies to text and doc sources, into image and video targets alike: the
rule is generic on medium, not hardcoded to one pair.

Traced: typing in a text node A → B's `hasUpstreamTextByNode` recomputes →
`GenNode` state flips to `ready` → click Genera on B → `run` form action
(`+page.server.ts`) → `runGenNode` (`generate.ts`) → `upstreamInputsFor`
(`upstream.ts`) → `sourceText` → composed prompt → `generateImagesWithoutBrand`
/`generateVideoWithoutBrand`.

## Also: the text node's empty preview box

A text node showed an empty `.gen-body` box with a centered "Pronto" before
anything had ever been generated — a placeholder repeating what the prompt
box right below it already said. `GenNode.svelte` now skips `.gen-body`
entirely for a text node with no result yet, keeping it only while
`running`/`failed` or once `refId` exists. Image and video nodes are
unaffected: their `.gen-body` is the only preview they have before a first
render, so it stays.
