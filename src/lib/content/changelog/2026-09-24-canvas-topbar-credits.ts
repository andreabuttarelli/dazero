import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Canvas now starts full-screen, with credits at a glance',
  items: [
    'The canvas now fills the whole screen, with the project and canvas switchers floating on top instead of sitting in their own bar.',
    'Your remaining credits now show right under those switchers, and take you straight to billing when clicked.',
    'The credits shown update automatically right after a generation spends them.'
  ]
} satisfies ChangelogEntry;
