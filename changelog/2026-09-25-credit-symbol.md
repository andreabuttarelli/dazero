# Credits get their own symbol instead of "cr"/"credits"

Every credit amount next to a number spelled the unit out inconsistently: `~N cr` on the gen
node buttons, `N credits` in the top bar, a bare number with no unit at all on the billing
ladder. None of it read as a currency.

## What's new

- `src/lib/components/CreditIcon.svelte`: inline SVG (three paths from a Noun Project mark,
  `viewBox` kept, fixed size/fill dropped so it inherits `currentColor` and sizes to `1em`).
  Attribution text baked into the source file was dropped from the icon; the Noun Project's free
  license still requires crediting the author (Gregor Cresnar) somewhere the user controls — not
  decided here, flagged in the PR/report for the user.
- `src/lib/components/CreditAmount.svelte`: `{ amount, approx? }` → `~12<icon>` sized to the
  text, `aria-label="12 crediti"` for screen readers (the icon itself is `aria-hidden`).
- Wired into: `GenNode.svelte` (Genera/Rifai, Loop ×N buttons — replaces `~N cr`), the canvas top
  bar (`CanvasTopBar.svelte` — replaces `app.shell.credits` i18n string, now unused there),
  `/app/billing` (balance, ladder rows, per-brand breakdown), the referral history row
  (`settings/referrals/+page.svelte`).

## Left as text, on purpose

- The loop/workflow confirm dialogs in `c/[canvasId]/+page.svelte` use the browser's native
  `confirm()` — no HTML, no icon possible. Kept the word "crediti".
- Sentence-embedded amounts (`app.ads.launchCost`, referral headline/subtitle, docs prose,
  `credit_warning` emails, `credits_exhausted` messages) stay as full translated sentences: the
  task asked for the symbol where it denotes the unit *next to a number*, not mid-sentence
  interpolation, and rewriting i18n sentence structure to interleave a component was out of
  scope here.
- Plain-text/HTML emails, meta tags, and CLI/API output keep the word "credits" — no icon channel
  there.
