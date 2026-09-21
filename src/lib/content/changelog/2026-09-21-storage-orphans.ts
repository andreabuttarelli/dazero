import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Deleting something now takes its files with it',
  items: [
    'Removing a row now removes the pictures and files that only that row was using, instead of leaving them behind in your library forever.',
    'Deleting an article now also removes its cover image — unless another article still uses it.',
    'A file is only removed once the row is actually gone, so a delete that fails never leaves you looking at a broken image.'
  ]
} satisfies ChangelogEntry;
