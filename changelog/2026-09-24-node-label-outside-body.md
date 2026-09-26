# The node label moves outside the body

Each node type drew its own type tag inside its body: `GenNode.svelte` (`gen-tag`),
`DocNode.svelte`, `IframeNode.svelte`, `ProductsNode.svelte`, `SocialFeedNode.svelte`,
`InfluencerNode.svelte`, `UploadedNode.svelte` — seven copies of one concept, each with
its own absolute-positioned `.xxx-tag` div and near-identical CSS, some compensating
with `padding-right: 72px` on a header so the tag wouldn't sit on top of it.

## What changed

The label — icon + node name — is now drawn once, by `CanvasTile.svelte`, the shared
wrapper every node type goes through. It sits `position: absolute; bottom: 100%; left: 0`
relative to the node's own DOM box (`.svelte-flow__node`, which is `position: absolute`
already), with a 4px gap: outside and above the top-left corner, like a Figma frame
name. The seven internal tags and their CSS are deleted, along with the header padding
that existed only to dodge them.

**One table for all twelve `nodes.type`, not seven.** `ADDABLE_ICON`/`ADDABLE_LABEL`
(`addable-icons.ts`, `addable.ts`) only cover the seven kinds the add-bar and the
double-click menu offer — `text`, `image`, `video`, `iframe`, `doc`, `products`,
`social_account_feed`. A node that already exists can be any of the twelve
`nodes_type_check` values (`node-data.ts::NODE_TYPES`), including five that never come
from a click: `social_post_mockup`, `ads`, `influencer`, `list`, `select`. The new
`node-label.ts` spreads `ADDABLE_ICON`/`ADDABLE_LABEL` and adds the missing five —
reusing instead of duplicating, so the seven shared kinds can't drift between the two
tables. `node-label.test.ts` asserts every `NodeType` has an entry.

**The name shown is `display_name` when set, the type's label otherwise.** `nodes.display_name`
wasn't threaded past the server repo before — `CanvasNodeRecord.displayName` existed,
but the page's local `Tile` type, `CanvasFlow`'s `Tile`/`TileData`, and `CanvasTile.svelte`
all dropped it. Added `displayName`/`kind` to all three so the value reaches the label.

**The selection toolbar had to move.** It anchored 10px above `box.y`, the screen-space
top of the selected node(s) — the same spot the new label now occupies. Fixing the gap
with a bigger constant pixel offset broke at high zoom: the label lives inside
SvelteFlow's zoomed viewport, so its on-screen height grows with zoom, while the toolbar
is `position: fixed` in screen space and doesn't. Instead, `CanvasSelectionBridge.svelte`
now raises the bounds it projects to screen space by a fixed `LABEL_CLEARANCE_FLOW`
(24) **in flow units, before** calling `flowToScreenPosition` — so the clearance scales
with zoom exactly like the label does. The toolbar's own 10px gap is back to its
original value, now measured from the already-raised point.

**Discarded**: computing the label's real rendered height and passing it down as a prop.
Rejected — a static flow-space margin large enough for the label's tallest realistic
content (one line, ellipsis-truncated) is simpler and doesn't need a resize observer on
something whose height barely varies.
