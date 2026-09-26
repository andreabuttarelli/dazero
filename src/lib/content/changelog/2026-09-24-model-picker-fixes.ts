import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Model picker fixes',
  items: [
    'The model picker menu now uses the same small, readable type as the rest of the toolbar.',
    'Provider groups in the model menu no longer split into duplicates.',
    'Connecting an image or video into a text node works again, and its ports now update right after you pick a new model.'
  ]
} satisfies ChangelogEntry;
