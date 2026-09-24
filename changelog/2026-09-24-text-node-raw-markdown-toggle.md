# A text node's output can be read as Markdown or as raw text

## What changed

A generated text always showed as a `<pre>` block, whitespace and all — a model asked
to write in Markdown (headings, lists, bold) had its output rendered literally instead
of formatted.

The renderer already exists: `doc-render.ts::renderDocHtml`, `marked` with a custom
`renderer` that escapes any raw HTML token found in the input (`<script>` etc. come
back as text, never live markup) and only lets `http(s):`/`mailto:`/`tel:`/`#`/`/`
hrefs through a link — the same sanitizer `DocNode.svelte` already trusts for a
document's own content. Reused as-is; the input is model output here instead of a
user's document, same untrusted-text assumption.

`text-view-mode.ts` is new: `loadTextViewMode`/`storeTextViewMode`, a thin, testable
wrapper over `localStorage` keyed per node id (`dazero:text-view-mode:<nodeId>`),
wrapped in try/catch so a blocked or absent store (private window, SSR — this page
renders server-side) falls back to `'markdown'`, the default, instead of throwing.
Nothing here is a node property or a database write — two people looking at the same
text node can each have their own raw/markdown choice, and it isn't a fact about the
content.

The toggle lives in `+page.svelte`'s `result` snippet — square corners, 10.5px type,
same `--line`/`--paper`/`--ink` tokens `GenNode.svelte` already uses. Its wrapper,
`.gen-text-wrap`, replaced the bare `<pre>` as `.gen-body`'s only child, so
`GenNode.svelte`'s existing height measurement (`.gen-body > *`, `ResizeObserver`) now
measures the toggle bar plus whichever view is active — the auto-grow ceiling reacts
to Markdown's typically taller rendering the same way it already reacts to raw text.

## Test

`text-view-mode.test.ts` — default, round-trip, per-node isolation, a throwing store,
and no store at all (the SSR case). `doc-render.test.ts` is new too: nothing exercised
`renderDocHtml`'s sanitizer directly before this — a raw `<script>` tag, a
`javascript:` link, a real `https:` link, and ordinary Markdown all render as expected.
