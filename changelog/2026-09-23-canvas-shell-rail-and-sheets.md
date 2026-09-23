# Replace the project sidebar with a floating rail, panels and sheets over the canvas

The old shell (`DashboardSidebar` + `/p/[projectId]/+layout.svelte`) put the canvas inside a
dashboard: a full nav tree on the left, a chat pane picked from three tabbed panels, every other
page (Assets, Brands, Ads, Settings) reached by navigating away from the tela. The product spec
called for the opposite hierarchy — the canvas fills the screen, and every other surface is
classified by how it relates to it:

| Family | Surfaces | How it opens |
|---|---|---|
| Alongside the canvas | Assets, Brands | non-modal panel, canvas stays interactive |
| Instead of the canvas | Ads, Settings | large floating sheet, own URL, Esc returns |
| Mobile | everything | full-screen route, own tab or a "More" sheet |

## The nav table

`src/lib/shell-nav.ts` is the single place that says how a destination opens — `family: 'panel'`
or `family: 'sheet'`, one row per destination. The rail (`FloatingRail.svelte`) renders two
groups separated by a divider, and the grouping itself is the behaviour: no `if` per button
scattered across components. `MOBILE_TABS`/`MOBILE_MORE_ENTRIES` are the mobile bar's own,
smaller inventory (Canvas · Chat · Ads · More).

**Calendar is deliberately absent.** The old calendar (schema `posts.platform`/`media_url`/`slot`)
was deleted as dead code on columns that don't exist in production (`18628294`). Its
`+page.server.ts` came back on the new `posts`/`post_sources` schema mid-way through this work,
but without a `+page.svelte` yet — pointing the rail at it would open a broken sheet. Re-adding it
is a one-line change in `NAV_ENTRIES` once the page lands.

## The sheet: real shallow routing, not a fake modal

`src/lib/canvas/sheet-nav.ts` wraps SvelteKit's shallow routing (`preloadData` + `pushState` from
`$app/navigation`). `pushState` genuinely rewrites the browser's address bar — that's not a
cosmetic detail: it's what makes Ads' and Settings' own `<form action="?/…">` submissions resolve
correctly without touching either page's code, since `enhance` reads the DOM's resolved `.action`
against the real address bar, not against SvelteKit's internal `page.url`. `page.url` itself stays
on the canvas route, so `CanvasFlow` is never unmounted — no lost selection, zoom or pan when a
sheet opens or closes.

`CanvasSheet.svelte` renders the exact same `+page.svelte` a direct link or a refresh would
render (`AdsSocialPage`, and Settings' own `+layout.svelte` plus whichever section
`sheet-pages.ts` resolves by folder via `import.meta.glob` — a new settings section needs no
wiring here). Settings also gets a compact section switcher inside the sheet, built from
`platforms.ts`'s existing `SETTINGS_GROUPS`: removing the old sidebar removed settings' only
navigation, and this reuses Agent F's own inventory rather than duplicating it.

## What was deleted

`DashboardSidebar.svelte` (1069 lines: `Sidebar.Provider`, chat/pages/assets panes, install-agent
dialog, brand switcher dropdown) and `workbench-paths.ts` + its pinning test (the old
Spazi/Pagine nav tree inventory) — both unreachable once the new layout mounts the rail instead.

## What stayed exactly as it was

`CanvasFlow.svelte`, the add bar, uploads, typed connectors, drag-drop of filled nodes, realtime,
undo — the canvas page's own script was untouched; only the chrome around it changed.
`ProjectDragPanel.svelte` (drag payload logic) was split via a `kind: 'assets' | 'brands' | 'both'`
prop instead of being rewritten, so the rail's two panels reuse the exact same drag code the
dedicated `/assets` and `/brands` pages already used.
