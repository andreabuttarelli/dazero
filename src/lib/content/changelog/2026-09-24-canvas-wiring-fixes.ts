import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Canvas wiring fixes',
  items: [
    'Text nodes connect to any node and pass their generated text, or the prompt if nothing has generated yet.',
    'Connections on the canvas no longer show a label on the line.'
  ]
} satisfies ChangelogEntry;
