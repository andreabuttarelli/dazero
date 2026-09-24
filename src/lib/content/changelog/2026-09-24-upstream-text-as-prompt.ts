import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'A connected text now counts as a prompt',
  items: [
    'An image or video node wired to a text or document, with no prompt of its own, is now ready to generate.',
    'A text node no longer shows an empty preview box before it has generated anything.'
  ]
} satisfies ChangelogEntry;
