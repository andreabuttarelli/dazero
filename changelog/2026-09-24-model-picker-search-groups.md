# Search and provider grouping in the canvas model picker

The model dropdown on `SelectionToolbar` listed every text/image/video model flat, in catalogue
order. With OpenRouter's growing chat listino this was already long; finding one model meant
scrolling and reading labels one by one.

## What changed

- `ModelChoice` (`canvas/gen-node.ts`) gained `provider: string` and `providerLabel: string`.
  Both are filled server-side, never re-derived from the raw id client-side — image and video
  choices only carry our internal id (`nano-banana-2`, `seedance-2-5`), which has no vendor
  prefix, so a client-side parse would silently mislabel every one of them.
- `providerOf` (`canvas/model-provider.ts`) is the one place that turns a wire id
  (`anthropic/claude-haiku-4.5`, `bytedance-seed/seedream-5-0-pro`) into `{provider,
  providerLabel}`. A small lookup table gives commercial names (ByteDance, xAI, Kling) to
  prefixes that don't read as one on their own; an unknown prefix gets a title-cased fallback
  instead of failing.
- Text choices (`canvas-catalogue.ts`) already carry a wire id (`gatewayModels()` reads
  OpenRouter's `/models` with the id unprefixed-by-us), so `providerOf` runs directly on
  `m.id`.
- Image/video choices (`offerable-models.ts`) only have our internal id. Both `imageChoice` and
  `videoChoice` now take the `wireId` already computed by `wireModelId` (used to check
  `ai_models` sync) and run `providerOf` on that instead — the translation from internal id to
  wire id already existed for a different reason, this reuses it rather than adding a second one.
- `filterChoices`/`groupByProvider` (`canvas/model-picker.ts`) are pure: substring match on label
  or provider label, case-insensitive; grouping preserves first-appearance order, so the group
  order tracks each medium's own catalogue order (Seedream first for image, as documented in
  `image-models.ts`) instead of introducing a second, alphabetical ordering to keep in sync.
- `SelectionToolbar.svelte`: a search input inside the open menu (`DropdownMenu.Content`),
  focused via an action rather than the `autofocus` attribute (avoids the a11y lint and works the
  same). `stopTypeahead` on `keydown` blocks everything except arrow keys and Escape from
  reaching bits-ui's built-in first-letter typeahead, which otherwise jumps focus on every
  keystroke typed into the search box. Query resets on menu close (`onOpenChange`). Groups render
  as `DropdownMenu.Label` (a plain, non-focusable div in bits-ui) with a `ProviderIcon`, followed
  by the filtered `DropdownMenu.RadioItem`s for that provider — unchanged in shape from before.
- `ProviderIcon.svelte`: pulls an SVG from `simple-icons` (already a dependency, used the same
  way as `platform-meta.ts`) for providers it has an icon for (Anthropic, Google, ByteDance,
  Qwen, Mistral, Perplexity, DeepSeek). No icon exists in this package version for OpenAI, xAI,
  Kling (`kwaivgi`), Black Forest Labs, or Meta — those fall back to a monochrome letter-mark
  square, not a second icon dependency.

## Not done

The closed trigger still shows only the resolved model's label — unchanged, as specified. No new
endpoint or MCP tool: this is catalogue data already fetched, reshaped for the same picker.
