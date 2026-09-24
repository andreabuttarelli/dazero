# A video/audio upstream of a text node no longer crashes the call

A video node wired into a text node on a video-capable Gemini model failed on every
run with `'file part media type video/mp4' functionality not supported.` — the same
happened for an upstream audio node fed by URL.

## Root cause

`llm.ts::urlContentParts` built video/audio inputs as AI SDK `FilePart`s
(`{ type: 'file', mediaType: 'video' | 'audio', data: URL }`), then `generateText`
sent them through `@ai-sdk/openai`'s provider (Responses API by default here, since
`llmClient()(modelId)` calls the bare provider function — chat-completions has the
identical restriction). That provider maps a `FilePart` to the wire format itself, and
it only knows `image`, `audio` (inline byte data only, never a URL) and
`application/pdf`; any other top-level media type — video always, audio by URL always
— throws `UnsupportedFunctionalityError` before a request is even sent.

OpenRouter itself accepts both: video as `{"type":"video_url","video_url":{"url":…}}`
and audio as `{"type":"input_audio","input_audio":{"data":<base64>,"format":…}}` — the
second one wants bytes, not a URL, unlike every other media type this codebase passes
by reference.

`llm-upstream-media.test.ts` mocked `generateText` directly, so it asserted what we
told the SDK to build, never what actually reached the wire — a green suite that never
saw a real request go out.

## Fix

When `llmText`'s `upstream` carries any video or audio URL, `llmText` no longer routes
through `generateText`/`@ai-sdk/openai` at all: it builds the OpenRouter-native
content array by hand and posts to `/chat/completions` itself — the same pattern
`groundedCall` already uses for the web-search plugin, which the AI SDK also can't
express. Images stay on the existing `generateText` path (untouched, still `image_url`
via the SDK). Audio parts are fetched and base64-encoded here since OpenRouter's
`input_audio` has no URL form; video stays a bare `video_url`, which is what the
signed storage URL already is.

Usage and cost accounting are preserved on the raw path: `usage: { include: true }` on
the request, `logAiCall` fed from `usage.prompt_tokens`/`completion_tokens`/`cost` in
the response — the same numbers `withUsageAccounting`/`costFromJson` read on every
other OpenRouter call, just parsed directly instead of through `billedFetch` (which
only wraps the AI SDK's own `fetch`, and this path doesn't go through the SDK).

## Test

`llm-media-wire.test.ts`, new — stubs global `fetch` and asserts the actual JSON body
that would leave the process: `video_url` for a video URL, `input_audio` with base64
data for an audio URL, never a `file` part. `llm-upstream-media.test.ts` keeps the
image assertions (still `generateText`) and drops the video/audio ones it could no
longer make true without lying about which path they exercise.

Connector gating (`connectors.ts::connectorsForNode`) needed no change: video/audio
input ports were already limited to models whose synced `ai_models.input_modalities`
declare them — the bug was purely in how the call was built, not in which models
offered the port.
