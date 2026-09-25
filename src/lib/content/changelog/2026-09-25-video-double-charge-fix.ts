import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Videos are no longer charged twice',
  items: [
    'Fixed a race that could bill a single video render more than once.'
  ]
} satisfies ChangelogEntry;
