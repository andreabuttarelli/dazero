import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-23',
  title: 'Two canvas bugs fixed: brand creation, and Generate',
  items: [
    'Creating a brand from a project\'s settings now actually shows it afterward, instead of looping back to "no brand yet".',
    'Picking a model and pressing Generate right away no longer silently fails — the run always starts.'
  ]
} satisfies ChangelogEntry;
