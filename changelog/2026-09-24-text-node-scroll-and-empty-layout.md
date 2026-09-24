# Scrolling inside a grown text node pans the canvas, and the prompt was cramped when empty

Two follow-ups to the text-node auto-grow work, reported after it shipped.

## Wheel over a scrollable area panned the canvas instead of scrolling it

xyflow's `panOnScroll` reads every wheel event on the canvas, including one fired
over the prompt textarea or the generated text once either hit `TEXT_NODE_MAX_HEIGHT`
and started scrolling internally. The library's own escape hatch is the `nowheel`
class (`noWheelClassName`, defaults to `"nowheel"` — confirmed in
`@xyflow/svelte`'s store, `noDragClass`/`noWheelClass` default to `'nodrag'`/`'nowheel'`).

Applying it unconditionally would break the opposite case: a short text, nowhere
near the ceiling, should still let the wheel pan the canvas over it. `scroll-guard.ts`
is new — `overflows(el)` (pure: `scrollHeight > clientHeight`) and a `scrollGuard`
Svelte action that toggles `nowheel` via `ResizeObserver`, so the class tracks the
node's own growth instead of being decided once at mount. Applied to the prompt
textarea, the generated-text `pre`, `DocNode`'s read/write areas, and `ListNode`'s
scroll body.

Text selection inside those same areas also got `nodrag`, so dragging to select text
doesn't drag the node instead.

## An empty text node's prompt now fills the whole node

Before any output exists (not running, not failed, no `refId`), `.gen-body` was
already omitted — but the prompt footer still sat at its natural two-row height,
leaving the rest of the node blank. `GenNode.svelte` had the "does this node have a
body" condition duplicated between the template's `{#if}` and (about to be) the
layout decision, so it's now one `hasBody` derived value read by both: the `{#if}`
that draws `.gen-body`, and a `.is-full` class that makes the footer and the textarea
flex to fill the node when there's nothing above them. Growth still comes from
`text-node-grow.ts` alone — this doesn't add a second sizing rule, just lets the
existing one apply to a bigger box when there's no result yet.

## Test

`scroll-guard.test.ts` — `overflows` on the three cases (overflowing, exactly full,
under capacity). The `hasBody`/`is-full` layout and the wheel-guard DOM wiring are
Svelte-action/CSS, exercised by hand; `gen-node.test.ts` already covers the state
transitions `hasBody` reads from.
