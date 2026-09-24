import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'The selection toolbar no longer covers nodes when zoomed out',
  items: [
    'The floating toolbar over a selection now shrinks with the canvas zoom, like the nodes themselves, instead of staying full-size and covering them.'
  ]
} satisfies ChangelogEntry;
