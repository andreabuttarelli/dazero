# Model picker: smaller type, one group per provider, ports that actually update

Three bugs reported together, all in the same area of the canvas.

## Smaller type in the model picker

`SelectionToolbar.svelte`'s model dropdown (items, provider headers, search
field) inherited shadcn's `dropdown-menu` defaults — `text-sm`/`text-xs`,
14px/12px — instead of the toolbar's own ~11.5px fields. Tailwind utilities
in this app carry `!important` (`tailwind.css`, to survive `app.css`'s
global reset), so the override needed `!important` too, matching the
pattern already used elsewhere (`CanvasSheet.svelte`). Fixed: items,
provider labels and the search input are all 11.5px now, same as the
aspect-ratio/duration/audio fields next to them.

## "DeepSeek" and "Deepseek" as two groups

`providerOf` (`model-provider.ts`) split a wire id on its first `/` and used
that prefix as the group key verbatim. OpenRouter's `~provider/model-latest`
alias ids (a moving pointer to whatever OpenRouter currently calls "latest"
for that family — confirmed live: 18 such rows across every provider, not
only DeepSeek) kept their leading `~`, so `~deepseek/...` and `deepseek/...`
became two different keys — `~deepseek` (falling through to the generic
title-case fallback, `~Deepseek`) and `deepseek` (the known label,
`DeepSeek`). Fixed: `providerOf` strips a leading `~` and lowercases the
prefix before lookup, so every alias groups with its provider's concrete
models. No dedup needed — an alias and its current concrete equivalent are
genuinely different ids with different `name`s from OpenRouter (e.g.
"DeepSeek V4 Flash **Latest**" vs "DeepSeek V4 Flash **0423**"), so showing
both, correctly grouped, is the right outcome, not a duplicate to collapse.

## Ports don't appear after picking a multimodal model

Two separate defects stacked on top of each other here.

1. **Stale ports on an existing node.** `CanvasFlow.svelte` keeps its own
   `nodes` state (SvelteFlow's requirement) synced from the `tiles` prop via
   `syncNodes` (`tile-sync.ts`). That function was written to protect only
   *position* during a drag — but it kept the WHOLE node object for anything
   already on the canvas, including `data.connectors`. Picking a new model
   updates `tiles[i].connectors` (computed from `data.model` via
   `connectorsForNode`), but the node SvelteFlow actually renders never
   picked up the change: `CanvasTile.svelte` kept drawing the ports computed
   at node-creation time. Fixed: `syncNodes` now rebuilds `data` from the
   incoming tile on every reconciliation and carries over only `position`
   for nodes SvelteFlow already knows — the one field that must survive an
   in-progress drag.

2. **The wire was rejected before the port mattered.** Separately,
   `canConnect` (`graph.ts`) still used the old static `accepts: Medium[]`
   table this repo's canvas moved away from (see the earlier "text nodes get
   model-driven ports" work) — `text.accepts` was `['text']` only, so
   dragging an image or video node onto ANY text node was refused outright
   (`un'immagine non alimenta un nodo testo`), regardless of which model the
   text node had selected, before `connectorsForNode`'s per-model port list
   was ever consulted. Fixed: `text.accepts` now includes `image` and
   `video`, same as `video.accepts` already did — the edge-level check only
   asks "could this medium ever feed this kind", the model-specific answer
   ("does THIS model actually read images") stays where it already lived,
   in `connectorsForNode`/`portAccepts`.

Traced: model pick in `SelectionToolbar.svelte` → `onpropertychange` →
`data.model` on the node row → `+page.svelte`'s `tiles` `$derived` →
`connectorsForNode` → `CanvasFlow.svelte`'s `syncNodes` (now refreshing
`data` on every tile change) → `CanvasTile.svelte` draws the ports; wire
acceptance: `CanvasFlow.svelte`'s `isValidConnection` → `verdictBetween` →
`graph.ts::canConnect` (now allowing image/video into a text node) → the
per-port check against `connectorsOf`.
