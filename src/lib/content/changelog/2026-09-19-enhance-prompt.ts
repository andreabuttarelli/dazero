import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-19',
  title: 'Rewrite a prompt for the model that will draw it',
  items: [
    'A new step rewrites your brief into the shape the model you picked actually wants, before you spend a render on it — labelled sections for one model, a single paragraph for another, a command instead of a description for a third.',
    'It rewrites, it never invents: anything that adds a subject you did not ask for, asks for text in the picture or sets the frame is thrown away, and your original comes back untouched with the reason.',
    'Available to agents and to the CLI, with or without a brand.'
  ]
} satisfies ChangelogEntry;
