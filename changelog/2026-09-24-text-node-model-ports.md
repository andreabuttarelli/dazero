# Text nodes get input ports driven by the chosen model

Image and video nodes already derived their input ports from the chosen
model's synced modalities (`connectorsFor`, `connectors.ts`). A text node
always got exactly one port — `text` — no matter what the model could
actually read: a vision LLM wired to an upstream image never saw it, because
`connectorsFor('text', ...)` had a hardcoded early return, and the image
never reached `llmText` because nothing in `generate.ts` sent it.

## What changed

`connectorsFor` no longer special-cases `kind === 'text'`: a text node now
gets `images`/`videos`/`audios` whenever the model's `input_modalities`
declare them — the same generic logic image/video already used, with one
floor added (`kind === 'text' || has.has('text')`): a text node keeps its
`text` port even before a model resolves, since the user's own prompt box is
always writable regardless of catalogue state.

The catalogue needed a new source: `canvas-catalogue.ts`'s text branch built
`ModelChoice`s straight from the gateway's `/models` cache
(`openrouter-models.ts`), which never carried `input_modalities` — only chat
completions history cared before. `ai-models-sync.ts` gained
`chatInputModalities`, one query over `ai_models` where `catalogue = 'chat'`
(the same sync `offerable-models.ts` reads for image/video), joined onto the
gateway list by id. A model not yet in that sync just gets `inputModalities:
[]` — never blocks the node, unlike image/video's `blocked` gate: text
generation doesn't need the sync to work, only the port list needs it to be
accurate.

Server-side, `upstream.ts::upstreamInputsFor` resolves real modalities for
`medium: 'text'` too now (`textModalitiesFor`, reading the `chat` catalogue)
— previously only `image`/`video` ever got past `{ input: [] }`, so a
connected image/video/audio was silently rejected before `resolveUpstreamInputs`
even looked at the model. `generate.ts`'s text branch now passes
`upstream.referenceImageUrls`/`referenceVideoUrls`/`referenceAudioUrls` into
`llmText`, which gained an `upstream` option: URLs go straight to the AI SDK
as `URL` objects (`ImagePart.image`/`FilePart.data` both accept one) — never
downloaded and re-encoded as base64 here, the provider fetches them.

The canvas page's model-change confirmation (`commonChange`, which warns
before a wire drops off an orphaned port) only checked `image`/`video`
nodes; text nodes are in that check now too.

Traced: model dropdown on a text node → `catalogue.text.choices[].inputModalities`
(`canvas-catalogue.ts` → `chatInputModalities`) → `connectorsForNode` draws
the `images`/`videos`/`audios` ports → wiring an upstream image in
→ `run` action → `runGenNode` → `upstreamInputsFor` (now resolving `chat`
modalities) → `resolveUpstreamInputs` accepts the wire → `referenceImageUrls`
→ `llmText({ upstream: { imageUrls } })` → `ImagePart` with a `URL`.
