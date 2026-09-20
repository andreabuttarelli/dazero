import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-19',
  title: 'Generated clips are now written for the model that renders them',
  items: [
    'Each video model is prompted the way it actually wants to be: the clip brief now carries the quirks of the model rendering it, so fewer clips come back with invented subtitles, duplicated people or broken reflections.',
    'Shot modes — hero, flat-lay, on-model, close-up, lifestyle, studio — each frame a product differently, and the brief is now written in the order that mode needs.'
  ]
} satisfies ChangelogEntry;
