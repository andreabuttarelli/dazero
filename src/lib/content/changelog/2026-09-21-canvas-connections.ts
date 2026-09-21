import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'Blocks on the canvas now float',
  items: [
    'Blocks on the canvas sit above it instead of being flat rectangles, and what a block produces fills the whole block instead of sitting inside a frame.',
    'The block you are working on comes forward, so it is clear which one your controls belong to.'
  ]
} satisfies ChangelogEntry;
