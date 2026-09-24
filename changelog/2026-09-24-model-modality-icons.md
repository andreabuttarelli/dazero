# Model dropdown shows what each model can read

The selection bar's model dropdown listed names only — nothing said which
models could read an image, a video or an audio wired in, so the new
model-driven text ports (previous entry) were invisible until you opened a
node and tried wiring something.

## What changed

`connectors.ts` gained `modalityBadges(inputModalities)`: a pure function
from a model's synced `input_modalities` to a small, ordered list of
`{modality, icon, color, label}` — text/image/video/audio reuse
`CONNECTOR_STYLE`'s port colors (the icon promises the same colored port the
model would open), `file` (PDF/documents) gets a neutral color since nothing
connects to that port today. An unrecognized modality string is dropped, not
guessed into an icon.

`ModalityIcons.svelte` renders that list as small lucide icons
(`type`/`image`/`video`/`audio-lines`/`file-text`), each with a `title`/
`aria-label` naming the modality. `SelectionToolbar.svelte`'s model picker
moved from a native `<select>` (which cannot hold per-option markup) to the
existing `DropdownMenu` primitive already used elsewhere in the canvas
(`CanvasTopBar.svelte`) — each entry now shows its icons next to the model
name, and the trigger shows the chosen model's own icons. Square corners
throughout, from the existing `--radius: 0` token; no per-model list written
by hand — the icons come from the same `ai_models` sync as the ports.
