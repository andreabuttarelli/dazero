import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Every block says what it is',
  items: [
    'Blocks on the canvas now carry a small label with their name and icon, so you can tell them apart when zoomed out or before they have any content.',
    'Drawing a line between two blocks now checks whether that link makes sense, and records what kind of link it is instead of assuming.'
  ]
} satisfies ChangelogEntry;
