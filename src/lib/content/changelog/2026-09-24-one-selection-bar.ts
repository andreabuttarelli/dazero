import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-24',
  title: 'One toolbar for a selected node',
  items: [
    'Selecting a node now shows one toolbar instead of two overlapping ones.',
    'Model, aspect ratio, duration and audio controls live in that toolbar, on the left of the duplicate/connect/delete icons.',
    'Selecting several nodes shows the same toolbar, with "Mixed" where they disagree.'
  ]
} satisfies ChangelogEntry;
