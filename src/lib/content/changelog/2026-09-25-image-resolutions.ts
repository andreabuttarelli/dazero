import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Image resolution options now match each model',
  items: [
    'Image nodes now offer only the resolutions a given model actually supports, instead of the same three options for every model.',
    'Switching an image node to a different model automatically adjusts a resolution the new model can\'t use.'
  ]
} satisfies ChangelogEntry;
