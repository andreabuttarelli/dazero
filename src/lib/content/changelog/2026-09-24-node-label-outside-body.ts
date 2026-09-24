import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'Node labels now sit above the canvas card',
  items: [
    'Every canvas node now shows its icon and name above the card, not inside it — like a frame name.',
    'The name is what you called the node, or the node type when you haven\'t renamed it.'
  ]
} satisfies ChangelogEntry;
