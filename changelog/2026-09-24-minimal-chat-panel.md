# Strip borders and dividers from the side chat

The chat panel had a border on every seam: panel left edge, tab bar underline,
message bubbles, the messages area, the composer box, and purple user
bubbles. Flattened it to background-only separation, per the square-corners /
minimal-UI direction already in the canvas toolbar.

- `CanvasChatPanel.svelte`: panel separates from canvas by `--paper-2`
  background instead of `border-left`; resize handle stays invisible until
  hover; tabs are plain text, active marked by weight/colour instead of an
  underline.
- `ChatMessage.svelte`: user messages are a faint `--ink`-tinted block instead
  of a solid purple bubble; assistant messages render as plain text, no box.
- `ChatComposer.svelte`: composer is a flat tinted field, no border; send/stop
  buttons are icon-only, no filled background.
- `CanvasGuideTab.svelte`: list items and the back link lost their borders;
  the doc table keeps a faint row divider (`border-bottom`) instead of a full
  cell grid, since that's structural, not decorative.

No behaviour change — style/markup only.
