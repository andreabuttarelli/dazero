# Composition node, phase 2: the node and its editor

Phase 1 (`src/lib/canvas/composition/`: `LAYOUTS`, `camera.ts`, `scene.ts`,
`/dev/composition`) was committed earlier today with white textures on the dev page —
`renderAt` ran once at mount, before `TextureLoader.load`'s async callback set the
material's map, and after that it only re-rendered on play or a control change. Fixed
by adding `onTextureReady` to `CompositionSceneOptions`, called once each mesh's
texture (image or video first frame) is ready, so a paused preview still shows the
real image. Also matched the image loader's `crossOrigin` to the video path's, needed
once real Supabase asset URLs replace the dev page's placeholders.

## What this phase adds

- `nodes.type = 'composition'`: wired through `node-data.ts` (schema, validated
  against `LAYOUTS`/`CAMERA_PRESETS`), `graph.ts` (medium `video`, requires an image),
  `connectors.ts` (`videos` output — matches the shape a generator node has before its
  generation step lands), `node-size.ts`, `node-label.ts` (icon `orbit`, label
  "Composizione"), `upstream-inputs.ts`, and `canvas-node-data.ts`
  (`compositionOf`/`compositionData`, same round-trip discipline as `effectsOf`/
  `effectsData`).
- Migration `supabase/canvas-migrations/20260925_composition_node.sql` extends
  `nodes_type_check` with `'composition'` — **not applied yet**, needs a manual apply.
- `CompositionNode.svelte`: the canvas tile. Static poster once the node has a
  `refId`, an "N immagini collegate" state once wired but unrendered, or a
  placeholder — never mounts Three.js.
- `CompositionEditor.svelte` + `CompositionParamControl.svelte` +
  `composition-editor.ts`: the floating editor, same shell as `EffectsEditor.svelte`.
  3D preview (lazy `import('$lib/canvas/composition/scene')`, dynamic — nothing pulls
  Three.js into the canvas's default bundle), transport bar, aspect-ratio frame
  overlay in CSS, layout/camera/background/duration/aspect controls on the right.
  "Salva" builds the next node and hands it to the caller; "Annulla" discards. No
  Export button — phase 3 renders the actual video.

## Deliberately not done

The add-bar (`addable.ts`/`addable-icons.ts`) does not offer creating a composition
node yet, same rollout gate the `effects` node type used before its migration
landed elsewhere.

The canvas page (`src/routes/p/[projectId]/c/[canvasId]/+page.svelte`) does not yet
mount `CompositionNode`/`CompositionEditor` or call `compositionOf`/`compositionData`
— that file is large, shared with several concurrently-live agents, and the mount
needs the same write/`pushGesture`/multi-image-upstream-resolution wiring
`applyEffects` uses for `effects`, done as its own minimal patch rather than folded
into this phase's other changes.
