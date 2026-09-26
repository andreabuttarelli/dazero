# Canvas effects video and in-node previews

Composition scene creation could resume after its canvas had unmounted. The
late dynamic import then passed `null` to Three.js, crashing the route while a
node run refreshed the canvas. Scene creation now owns the canvas captured
before the import and aborts if that exact element is no longer mounted.
The node preview canvas no longer captures double clicks, and is disposed
before the editor creates its renderer. Media textures disable the WebGL
pixel-store flags rejected by texture-array uploads.

Composition nodes now render their looping Three.js scene inside the tile.
The preview is contained in the selected 9:16, 1:1, or 16:9 frame. Effects
previews contain the source ratio instead of cropping it to the tile.
Video previews apply the active effect stack frame by frame instead of showing
the unfiltered source.

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

The helix now stays centered in the social frame, keeps cards readable, and
uses smaller defaults. A new fixed-camera oblique grid scrolls alternate
columns at different integer speeds, preserving a closed geometric loop.
The cinematic cloud is now a fixed-camera depth field: readable cards move on
layered periodic paths, remain centered, and return exactly to their starting
positions without random turns or jumps.
Repeated inputs now follow each composition's visual topology. Linear flows
cycle media in order, grid rows and columns are offset, and every ring advances
its own sequence so equal media do not sit next to each other.
The new exploratory grid presents nine large cards as a continuous field. It
holds on seeded media targets, travels across the intervening cards with an
exponential ease, fades wrapping edges, and closes on its exact starting frame.
An off-screen toroidal pool now grows from the current camera distance, FOV and
aspect ratio, keeping the field filled at every supported zoom. Each target
arrival zooms the entire grid in; departure zooms it back out before travelling
to the next subject.
