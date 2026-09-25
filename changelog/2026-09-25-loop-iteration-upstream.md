# Loop iterations all received list item 1

A loop over a `list`'s `iterate` wire ran N real generations but every iteration produced the
same output — item 1 of the list, again and again.

## Root cause

`runOneCombination` (`loop.ts`) resolved `upstreamInputsFor` with the right `iterateSelection`
just to check `upstream.blocked`, then discarded that result and called `runGenNode`
(`generate.ts`). `runGenNode` resolves its own upstream internally, and `StartRun` had no
`iterateSelection` field to carry the per-iteration index — so its internal resolution always
ran with an empty selection, and a `list` with an empty selection behaves like a `fixed` wire:
`referenceImageUrls[0]`, the first item, every time.

Confirmed on the live run (node `e64c966a…`, list `9821fa55…`, two wired image sources): both
loop tickets' `params.loop.values` correctly carried `"1"` and `"2"`, but both generations used
the same reference image (`asset-a`'s `url`), because the index never reached the upstream call
that actually built the provider request.

## Fix

`StartRun.iterateSelection` carries the map through; `runGenNode` passes it into its own
`upstreamInputsFor` call. `loop.ts::runOneCombination` sets it on the `StartRun` it builds, so
both the pre-check and the real generation resolve the same iteration.

## Test

`loop.iterate-selection.test.ts` reproduces it end-to-end (no `runGenNode` mock): two wired
images into an empty `list`, an `iterate` wire into an image node, two `retryLoopCombination`
calls — asserts `generateImagesWithoutBrand`'s `baseMediaId` differs between iteration 1 and 2.
Every existing `loop.test.ts` test mocks `runGenNode` outright, which is why this shipped
unnoticed: none of them exercise the real upstream resolution `runGenNode` does internally.
