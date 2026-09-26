import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Video resolution options now match each model',
  items: [
    'Video nodes now offer only the resolutions a given model actually supports, instead of the same two options for every model.',
    'Switching a video node to a different model automatically adjusts a resolution the new model can\'t use.'
  ]
} satisfies ChangelogEntry;
