# Auto-grow measured a container clamped to its own size, so it never grew

Reported live: a text node with generated output showed the result squeezed
into ~28px (the Markdown/Raw toggle plus one line) while the prompt textarea
below took the rest of the node, even though the text had far more content
than that.

`measureHeight` in `GenNode.svelte` measured `.gen-body > *`'s `scrollHeight`
to decide how tall the node should grow (`text-node-grow.ts::grownTextNodeHeight`,
fed through `onmeasure` → the page's `grownHeights` map). That selector's
first child is `.gen-text-wrap` (the toggle plus the text/markdown view,
introduced in the raw/markdown toggle work) — and `.gen-text-wrap` is
`height: 100%; min-height: 0`. Its `scrollHeight` is therefore always equal
to whatever height `.gen-body` already has, never to what the text inside
actually needs: the measurement was circular, so the node could never report
"I need to be taller" and stayed at its minimum height.

The element that actually knows the content's true size is `.gen-text` — the
inner `overflow: auto` element the toggle switches between markdown and raw.
`measureHeight` now looks for `.gen-text` first, falling back to the old
`.gen-body > *` selector for image/video results, which don't wrap their
content and were measuring correctly already.

Reproduced in isolation with the real CSS from both files: the old selector
reported `scrollHeight: 161` against a content height of `240` — the same
shape as the live report's `28px` visible against `239` actual. The fixed
selector reports the true `240`.

A node with a saved `size.height` (the user resized it by hand) still wins
over auto-grow, by design (`grownTextNodeHeight`'s `userHeight` branch,
unchanged) — this fix only restores growth for a node that has never been
resized.
