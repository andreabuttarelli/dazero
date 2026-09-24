import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'A finished post composer',
  items: [
    'Reordering and removing media in the post composer now uses real buttons, not plain text links.',
    'No brand yet? The composer now links straight to creating one.',
    'Save and schedule buttons explain why they are disabled when something is missing.'
  ]
} satisfies ChangelogEntry;
