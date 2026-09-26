import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Lists and single-item picks on the canvas',
  items: [
    'A loop now shows its results as a list node on the canvas, each item with a live status while it renders.',
    'New list and select nodes: build a list by dragging assets or typing lines, and pick one item from it by number.',
    'A failed item in a loop result can be retried on its own.',
    'Wires can now be set to feed a loop once per item ("iterate") or the same way every time ("fixed").'
  ]
} satisfies ChangelogEntry;
