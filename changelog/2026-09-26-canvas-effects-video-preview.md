# Canvas effects video and in-node previews

Composition scene creation could resume after its canvas had unmounted. The
late dynamic import then passed `null` to Three.js, crashing the route while a
node run refreshed the canvas. Scene creation now owns the canvas captured
before the import and aborts if that exact element is no longer mounted.

Composition nodes now render their looping Three.js scene inside the tile.
The preview is contained in the selected 9:16, 1:1, or 16:9 frame. Effects
previews contain the source ratio instead of cropping it to the tile.

Effects nodes now accept one image or video and keep the same medium at their
output. Video frames use the existing effect stack; the server rebuilds an
MP4 and muxes the source audio into it. Applying effects first saves the stack,
source reference, and medium through the versioned node write, then renders.
A failed or conflicting write no longer closes the editor as if it succeeded.

Canvas prompt enhancement now enters the run's organization scope before the
LLM call, so `prompt.enhance` writes a billed `ai_calls` row.

Tests cover the unmounted-canvas race, organization attribution, media-kind
round trips, image/video graph rules, server image/video output, and preserved
video audio.
