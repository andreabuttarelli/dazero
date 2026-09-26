# Replace the project sidebar with a floating rail, panels and sheets over the canvas

The old shell (`DashboardSidebar` + `/p/[projectId]/+layout.svelte`) put the canvas inside a
dashboard: a full nav tree on the left, a chat pane picked from three tabbed panels, every other
page (Assets, Brands, Ads, Settings) reached by navigating away from the tela. The product spec
called for the opposite hierarchy — the canvas fills the screen, and every other surface is
classified by how it relates to it:

| Family | Surfaces | How it opens |
|---|---|---|
| Alongside the canvas | Assets, Brands | non-modal panel, canvas stays interactive |
| Instead of the canvas | Calendar, Ads, Settings | large floating sheet, own URL, Esc returns |
| Mobile | everything | full-screen route, own tab or a "More" sheet |

## The nav table

`src/lib/shell-nav.ts` is the single place that says how a destination opens — `family: 'panel'`
or `family: 'sheet'`, one row per destination. The rail (`FloatingRail.svelte`) renders two
groups separated by a divider, and the grouping itself is the behaviour: no `if` per button
scattered across components. `MOBILE_TABS`/`MOBILE_MORE_ENTRIES` are the mobile bar's own,
smaller inventory (Canvas · Chat · Calendar · More).

**Calendar was briefly absent, mid-refactor.** The old calendar (schema
`posts.platform`/`media_url`/`slot`) was deleted as dead code on columns that don't exist in
production (`18628294`). Its `+page.server.ts` came back on the new `posts`/`post_sources` schema
(Zernio-backed) before `+page.svelte` did, so the rail temporarily left Calendar out rather than
open a broken sheet. Both landed together in the same branch shortly after — `NAV_ENTRIES` now
carries all five destinations.

## The sheet: real shallow routing, not a fake modal

`src/lib/canvas/sheet-nav.ts` wraps SvelteKit's shallow routing (`preloadData` + `pushState` from
`$app/navigation`). `pushState` genuinely rewrites the browser's address bar — that's not a
cosmetic detail: it's what makes Ads' and Settings' own `<form action="?/…">` submissions resolve
correctly without touching either page's code, since `enhance` reads the DOM's resolved `.action`
against the real address bar, not against SvelteKit's internal `page.url`. `page.url` itself stays
on the canvas route, so `CanvasFlow` is never unmounted — no lost selection, zoom or pan when a
sheet opens or closes.

`CanvasSheet.svelte` renders the exact same `+page.svelte` a direct link or a refresh would
render (`CalendarPage`, `AdsSocialPage`, and Settings' own `+layout.svelte` plus whichever section
`sheet-pages.ts` resolves by folder via `import.meta.glob` — a new settings section needs no
wiring here). Settings also gets a compact section switcher inside the sheet, built from
`platforms.ts`'s existing `SETTINGS_GROUPS`: removing the old sidebar removed settings' only
navigation, and this reuses Agent F's own inventory rather than duplicating it.

## The wiring trace, per rail entry — "a function doesn't exist until it's linked"

| Rail entry | Click handler | Opens | Renders | Test that proves the link |
|---|---|---|---|---|
| Assets | `FloatingRail` → `onClick` → `onPanel(entry)` → `+layout.svelte`'s `onRailPanel` → `leftPanel = 'assets'` | `CanvasLeftPanel` (mounted `{#if leftPanel}`) | `ProjectDragPanel` with `kind="assets"` | `project-drag-panel-wiring.test.ts` (panel mounts `ProjectDragPanel`, `kind` reaches it) |
| Brands | same path, `leftPanel = 'brands'` | `CanvasLeftPanel` | `ProjectDragPanel` with `kind="brands"` | same file |
| Calendar | `FloatingRail` → `onClick` → `onSheet(entry)` → `+layout.svelte`'s `onRailSheet` → `openSheet(projectId, '/calendar')` | `CanvasSheet` (`page.state.sheet` set by `pushState`) | `CalendarPage` (`calendar/+page.svelte`) with the `data` `preloadData` already fetched | `shell-nav.test.ts` (`sheetEntryForPath('/calendar')` resolves), `sheet-nav.test.ts` (`sheetOutcomeOf` opens on a 200), `shell.spec.ts` (e2e: URL becomes `/p/<id>/calendar`, dialog visible, Esc returns) |
| Ads | same path, `openSheet(projectId, '/ads/social')` | `CanvasSheet` | `AdsSocialPage` (`ads/social/+page.svelte`) | `shell-nav.test.ts`, `sheet-nav.test.ts` |
| Settings | same path, `openSheet(projectId, '/settings/connected-accounts')` | `CanvasSheet` | `SettingsLayout` + whichever section `sheet-pages.ts`'s `settingsPageLoader` resolves | `shell-nav.test.ts` (`sheetEntryForPath` matches any `/settings/*` sub-path), `sheet-pages.test.ts` (every real section under `settings/` has a loader, including the two-level `ads/accounts`) |

The home redirect (`/p/[projectId]` → its first canvas) is `+page.server.ts`'s `load`, proven by
`home-redirect.test.ts` — three cases: redirects inside the project, not to a bare `/c/<id>`;
falls back to `/app` with zero canvases; picks the first canvas, not any canvas.

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
