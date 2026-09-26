import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Each model now shows its own settings',
  items: [
    'Each model now shows its own settings, like quality for GPT Image, in the canvas toolbar.',
    'Switching a node to a different model automatically drops a setting the new model can\'t use.'
  ]
} satisfies ChangelogEntry;
