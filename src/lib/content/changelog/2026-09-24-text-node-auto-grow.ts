import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Text nodes grow with what you write',
  items: [
    'A text node now gets taller as your prompt or the generated text gets longer, up to a limit, so both stay readable instead of scrolling in a small box.',
    'Resizing a text node by hand keeps your chosen height from then on.'
  ]
} satisfies ChangelogEntry;
