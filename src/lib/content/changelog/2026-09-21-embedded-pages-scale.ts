import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Embedded pages stay put and fit the block',
  items: [
    'An embedded page no longer reloads itself over and over while you pan and zoom around the canvas.',
    'The page inside now shrinks to fit its block instead of showing you the top-left corner at full size, and it keeps fitting as you resize the block.'
  ]
} satisfies ChangelogEntry;
