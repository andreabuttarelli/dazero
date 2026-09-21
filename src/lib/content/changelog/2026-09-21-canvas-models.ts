import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Pick a model on the canvas',
  items: [
    'Text, image and video blocks now list the models you can actually use, each with the formats and lengths it supports — so a request cannot be built that the model would refuse.',
    'A block shows its settings only when you select it, leaving the picture or clip the whole space the rest of the time.'
  ]
} satisfies ChangelogEntry;
