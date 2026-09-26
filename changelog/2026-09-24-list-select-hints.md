# Self-explaining list and select nodes

Both nodes were silent about what they do until someone had already used
them once. Added in-node copy and a link to the Loop guide instead.

## What's there

- `ListNode.svelte`: empty state now reads "Trascina qui immagini o scrivi
  una riga per elemento: ogni elemento è un giro del Loop", replacing the
  purely mechanical "Trascina asset qui, o scrivi righe di testo sotto".
- `SelectNode.svelte`: when no `list` prop is wired in (the same
  `listFeedingSelect` resolution the canvas page already does), the empty
  state now reads "Sceglie un elemento da una lista collegata, per numero"
  plus "Collega una lista" — was "Collega una lista" alone.
- Both nodes got a small "?" button (`HelpCircle`, 13px) in their header,
  opening the Guide tab at the `loop` guide — it already documents both
  node types ("L'elenco dei risultati", "Scegliere un risultato").

## Wiring the "?" button

The click doesn't just flip a local boolean: the chat panel where the Guide
tab lives may be closed, and even open it may be on the Chat tab.

`ListNode`/`SelectNode` → `requestGuide('loop')`
(`src/lib/canvas/guide-open.ts`, a `writable<GuideSlug | null>`) →
`/p/[projectId]/+layout.svelte`'s `$effect` opens the chat panel if it was
closed → `CanvasChatPanel.svelte`'s `$effect` switches to the `guide` tab →
`CanvasGuideTab.svelte` takes the pending slug as `initialSlug`, opens that
guide, and calls `onopened` to clear the request.

Traced end to end, no mock: the store is the same instance across all four
files (`$lib` import), and `CanvasGuideTab` already had `guideBySlug` for
lookup — only the prop wiring was new.

## Not done as a pure-logic test

`guide-open.ts` is a bare `writable` with a one-line setter; there is no
branching to fail red-then-green on. The two-line "not wired" check in
`SelectNode.svelte` reuses the same `!list` condition the page's
`listFeedingSelect` already produces — that resolution itself is unit
tested (`select-node.test.ts` if present) and not duplicated here.
