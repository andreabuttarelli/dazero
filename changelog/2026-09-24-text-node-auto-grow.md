# A text node grows with its content, up to a ceiling

## What changed

`gen-node.ts::genNodeSize('text')` (360×220) was the only height a text node ever
had — the prompt textarea and the generated text both scrolled inside that fixed box
no matter how much either held.

`text-node-grow.ts` is new: `TEXT_NODE_MIN_HEIGHT` (=`genNodeSize('text').h`, one
source of truth, not a second 220 written by hand), `TEXT_NODE_MAX_HEIGHT` (640), and
`grownTextNodeHeight(measuredContentHeight, userHeight?)` — a pure clamp. A node the
user resized by hand keeps `userHeight` unconditionally; that's what `Tile.userHeight`
(new field, from `node.size.height` as the database has it, before any fallback) turns
into a hard override in `+page.svelte::tileHeight`.

`GenNode.svelte` measures real DOM height, not characters — `scrollHeight` of the
prompt textarea and of the result body's own content, via `ResizeObserver` on both so
it re-fires while typing or while the result streams in, not only at mount. It reports
the sum through a new `onmeasure` prop; `+page.svelte` keeps those numbers in
`grownHeights`, a plain `$state` map that never reaches `write()`/`post()` — display
only, exactly the constraint asked for. `.gen-text`'s CSS moved from `height: 100%`
to `min-height: 100%`: fixed height would have made its own `scrollHeight` always
equal its container's, hiding the very overflow the whole feature exists to measure.

**`tile-sync.ts::syncNodes` had a gap this surfaced.** It reconciles SvelteFlow's own
node list against the page's `tiles`, keeping the CURRENT node's `position` (a
drag-in-progress) but rebuilding everything else. Whether to return the rebuilt array
at all was decided by comparing `data` only — a node whose `style` (this feature's
`width:${w}px;height:${h}px`) changed with `data` unchanged returned `null`
(no update), and a text node growing would never actually resize on screen. Fixed to
also compare `style`.

## Test

`text-node-grow.test.ts` — the clamp: floor, pass-through in range, ceiling, and
`userHeight` overriding regardless of measured content. `tile-sync.test.ts` — a new
case for a `style`-only change now being detected.
