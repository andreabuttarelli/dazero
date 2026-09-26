# Floating sheets: anchored panel instead of a floating box

The sheets `FloatingRail.svelte` opens (Calendar, Ads, Settings, Create post) used
`Sheet.Content side="right"` with `inset: 3vh 3vw !important` in `CanvasSheet.svelte`. That
computed to a near-square box floating top-left, overlapping the rail, narrow for its height —
not the "panel next to the rail" the design intends. The left panels
(`CanvasLeftPanel.svelte`: Assets/Brands/Influencers) sat close to right but started at
`top: 12px`, overlapping the top bar.

## What changed

- `src/lib/shell-nav.ts` — new `SHEET_WIDTHS` table, one width per sheet/panel id, next to
  `NAV_ENTRIES`. Calendar (a month grid) gets 960px; Ads/Settings/Create post 720px; the three
  left panels 320px. One table, not CSS scattered per component.
- `CanvasSheet.svelte` — `Sheet.Content` now opens `side="left"`, anchored `left: 60px` (next to
  the rail) `top: 44px` (below the top bar) to `bottom: 0`, width from the table via a CSS
  custom property. Content scrolls in a new `.sheet-scroll` wrapper; the settings switcher stays
  its own fixed-width column as before.
- `CanvasLeftPanel.svelte` — same anchoring (`top: 44px`, full height), width from the same
  table instead of a hardcoded `260px`.

## The `!important` fight

Tailwind v4 compiles `data-[side=left]:sm:max-w-sm` etc. with `!important` on every utility.
Component `<style>` overrides with `!important` at equal specificity lost even though they load
later in the DOM: unlayered CSS loses to a named `@layer` for `!important` declarations (layer
order reverses for `!important` — the earliest declared layer wins). The fix wraps the override
in `@layer utilities { ... }` too, so normal source-order tiebreaking applies and the
later-loaded rule wins. Verified with a Playwright script reading `getComputedStyle` /
`CSSStyleSheet.cssRules` directly — screenshots alone would not have caught this since the
element's positioning "looked" right in a light click-through, but width was still clamped to
Tailwind's `max-w-sm` (384px) until the layer was fixed.

## Verified

Screenshots at 1440×900 and 1280×800 before and after, for Calendar, Ads, Settings, Assets and
Influencers. Confirmed panel is anchored, full height below the top bar, doesn't overlap the
rail, and content scrolls inside a fixed header.
