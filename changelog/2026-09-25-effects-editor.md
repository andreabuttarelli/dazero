# Effects editor: the Effetti node becomes usable

Phase 3 of 3. Phase 1 built the pure engine (`src/lib/canvas/effects/`), phase 2 the `effects`
node type with a hidden editor button. Before this, an Effetti node could be added but nothing
edited its stack.

## What changed

- `EffectsEditor.svelte` — floating panel anchored like `CanvasSheet` (`top: 44px`, `left: 60px`),
  square corners. Preview downscaled to 900px, redrawn with an 80ms debounce plus
  `requestAnimationFrame`; before/after toggle. Applica renders at full resolution on the main
  thread with a busy state.
- `EffectParamControl.svelte` — one control for every param, driven by `controlFor`
  (`effects/editor.ts`), a table keyed by `EffectParam.kind`. No per-effect branches.
- `effects/editor.ts` — pure stack operations (add, move, toggle, remove, set param),
  `inputChanged`, `fitWithin`.
- `EffectStep.enabled` — steps can be switched off; `applyStack` skips them, stored steps
  without the flag read as enabled, the zod schema keeps it.
- Apply path: Applica → `applyEffects` in the canvas page → browser upload to `canvas-assets` →
  `upload` action with `into=library` (`registerUploadedAsset`, no extra node) → `write` action
  with `{ effects, refId, sourceRefId }` → `nodes.data`.
- The node shows "Input cambiato · Riapplica" when the upstream image differs from the one last
  applied.

## Defects found on the way

- Creating an Effetti node failed validation: `newNodeRow` writes `refId: null`, the schema only
  allowed a string. Now `nullish`.
- `upstreamImageRefOf` read `data` from `nodesById`, which only holds id and type, and ignored
  uploaded images (they carry `assetId`, not `refId`). Replaced by the tested
  `upstreamImageRef`.

## Discarded

- Web Worker for the full-res render: main thread with a spinner is enough for now.
- A new upload endpoint: the existing `upload` action takes an `into` field instead.
