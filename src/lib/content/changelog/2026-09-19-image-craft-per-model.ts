import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-19',
  title: 'Every image model is now briefed the way it wants to be',
  items: [
    'Each image model reads prompts differently — one wants labelled sections, another a single flowing paragraph, another a command when it edits. Briefs now carry the notes for whichever model is drawing, so the same request lands better whichever one you pick.',
    'On-image text comes out sharper on the models that can actually spell, and a model with no published guidance gets only what we have measured ourselves rather than invented advice.'
  ]
} satisfies ChangelogEntry;
