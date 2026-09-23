import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-23',
  title: 'Work faster on the canvas',
  items: [
    'Duplicate nodes with ⌘D, copy and paste them with ⌘C and ⌘V, even onto another canvas.',
    'Select several nodes to get a toolbar: duplicate, delete, or wire them all at once.',
    'Connect a selection to a new text, image or video node, or to one already on the canvas.',
    'Change the model or aspect ratio of several nodes together.',
    'Double-clicking the canvas no longer opens a menu.'
  ]
} satisfies ChangelogEntry;
